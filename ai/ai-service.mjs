/**
 * AI Service for Lesson Studio AI
 * On-device AI only, so lesson text never leaves the computer:
 * 1. Chrome Built-in Prompt API (LanguageModel / window.ai)
 * 2. Smart Heuristic Curriculum AI Engine (reliable offline fallback)
 * A Code.org-hosted relay may be added later; there is no cloud AI path today.
 */

const ENGINES = ['auto', 'builtin', 'heuristic'];

export class AIService {
  static async getSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      // 1.5.0 removed Gemini: delete any key an earlier version saved.
      await chrome.storage.local.remove(['geminiApiKey', 'aiTemperature']).catch(() => {});
      const { preferredAiModel } = await chrome.storage.local.get('preferredAiModel');
      return { preferredAiModel: ENGINES.includes(preferredAiModel) ? preferredAiModel : 'auto' };
    }
    if (typeof localStorage !== 'undefined') localStorage.removeItem('lesson_studio_gemini_key');
    return { preferredAiModel: 'auto' };
  }

  static async saveSettings({ preferredAiModel }) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ preferredAiModel: ENGINES.includes(preferredAiModel) ? preferredAiModel : 'auto' });
    }
    return true;
  }

  static async detectCapabilities() {
    let hasPromptApi = false;
    let promptApiVersion = 'unavailable';

    const langConfig = {
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputLanguages: ['en'],
      expectedInputLanguages: ['en'],
      outputLanguage: 'en'
    };

    try {
      if (typeof globalThis.LanguageModel !== 'undefined') {
        const availability = await globalThis.LanguageModel.availability?.(langConfig);
        hasPromptApi = availability === 'readily' || availability === 'after-download';
        promptApiVersion = 'LanguageModel (Standard MV3)';
      } else if (typeof window !== 'undefined' && window.ai?.languageModel) {
        const capabilities = await window.ai.languageModel.capabilities?.(langConfig);
        hasPromptApi = capabilities?.available === 'readily' || capabilities?.available === 'after-download';
        promptApiVersion = 'window.ai.languageModel';
      }
    } catch (err) {
      console.warn('LanguageModel availability check:', err);
      hasPromptApi = false;
    }

    const settings = await this.getSettings();
    const activeEngine = settings.preferredAiModel !== 'heuristic' && hasPromptApi ? 'builtin' : 'heuristic';

    return {
      hasPromptApi,
      promptApiVersion,
      activeEngine,
      heuristicFallbackAvailable: true
    };
  }

  static async executePrompt({ systemInstruction, prompt, temperature = 0.7 }) {
    const caps = await this.detectCapabilities();

    const langConfig = {
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputLanguages: ['en'],
      expectedInputLanguages: ['en'],
      outputLanguage: 'en',
      systemPrompt: systemInstruction,
      initialPrompts: systemInstruction ? [{ role: 'system', content: systemInstruction }] : [],
      temperature
    };

    // 1. Chrome Built-in Prompt API
    if (caps.activeEngine === 'builtin' && caps.hasPromptApi) {
      try {
        if (typeof globalThis.LanguageModel !== 'undefined') {
          const session = await globalThis.LanguageModel.create(langConfig);
          const result = await session.prompt(prompt);
          session.destroy?.();
          return { text: result, engine: 'Chrome Built-in Prompt API' };
        } else if (window.ai?.languageModel) {
          const session = await window.ai.languageModel.create(langConfig);
          const result = await session.prompt(prompt);
          session.destroy?.();
          return { text: result, engine: 'Chrome window.ai' };
        }
      } catch (err) {
        console.warn('Built-in Prompt API call failed, trying fallback:', err);
      }
    }

    // 2. Smart Heuristic Engine
    return {
      text: null,
      engine: 'Heuristic Curriculum Engine',
      isHeuristic: true
    };
  }

  /**
   * AI Lesson Parser: Converts unformatted speaker notes or outlines into structured lesson data
   */
  static async parseUnstructuredNotes(rawText, title = 'Untitled Lesson') {
    const sysPrompt = `You are an expert curriculum developer for Code.org. Parse the following rough lesson content or speaker notes into structured JSON.
Format strictly as JSON with this schema:
{
  "title": "string",
  "teacherOverview": "string",
  "studentOverview": "string",
  "objectives": ["string"],
  "preparation": "string",
  "vocabulary": [{"word": "string", "definition": "string"}],
  "activities": [
    {
      "id": "act-1",
      "title": "Warm Up",
      "duration": 5,
      "sections": [
        {
          "id": "sec-1",
          "title": "Introduction",
          "duration": 5,
          "body": "Teacher guidance markdown...",
          "remarks": false,
          "callouts": [
            {
              "type": "Teaching Tip", // One of: Teaching Tip, Content Corner, Discussion Goal, Assessment Opportunity, Ethics Opportunity
              "body": "Tip text"
            }
          ]
        }
      ]
    }
  ]
}`;

    const prompt = `Lesson Title: ${title}\n\nContent:\n${rawText}`;
    const result = await this.executePrompt({ systemInstruction: sysPrompt, prompt });

    if (result.text) {
      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          parsed.aiSource = result.engine;
          return parsed;
        }
      } catch {
        // Parse error, proceed to heuristic
      }
    }

    // Heuristic Fallback Parser
    return this.heuristicParseNotes(rawText, title);
  }

  static heuristicParseNotes(rawText, title = 'Untitled Lesson') {
    const lines = rawText.split(/\r?\n/).map(l => l.trim());
    const objectives = [];
    const activities = [];
    let currentActivity = null;
    let currentSection = null;
    let teacherOverview = '';
    let studentOverview = '';
    let preparation = '';
    const vocabulary = [];

    let currentMode = 'overview';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Detect Objectives
      if (/^(objectives?|learning goals?|swbat):/i.test(line)) {
        currentMode = 'objectives';
        continue;
      }
      // Detect Preparation
      if (/^(preparation|materials?|setup):/i.test(line)) {
        currentMode = 'prep';
        continue;
      }
      // Detect Vocabulary
      if (/^(vocabulary|key terms?):/i.test(line)) {
        currentMode = 'vocab';
        continue;
      }

      // Check if line is an Activity Header (e.g. "Warm Up (5 mins)" or "Activity (30 min)")
      const actMatch = line.match(/^([A-Za-z0-9\s-]+?)\s*\((\d+)\s*min(?:ute)?s?\)/i) ||
                       line.match(/^###?\s*(Warm Up|Activity|Wrap Up|Introduce|Explore|Debrief|Reflect)(?:\s*\((\d+)\s*mins?\))?/i);

      if (actMatch) {
        currentMode = 'activity';
        const actTitle = actMatch[1].trim();
        const duration = actMatch[2] ? parseInt(actMatch[2], 10) : 15;
        currentActivity = {
          id: `act-${activities.length + 1}`,
          title: actTitle,
          duration,
          sections: []
        };
        activities.push(currentActivity);

        currentSection = {
          id: `sec-${activities.length}-1`,
          title: actTitle,
          duration,
          body: '',
          remarks: false,
          callouts: []
        };
        currentActivity.sections.push(currentSection);
        continue;
      }

      // Check if line is a Callout header
      const calloutMatch = line.match(/^(Teaching Tip|Content Corner|Discussion Goal|Assessment Opportunity|Ethics Opportunity):?\s*(.*)$/i);
      if (calloutMatch && currentSection) {
        const typeRaw = calloutMatch[1];
        let standardType = 'Teaching Tip';
        if (/content/i.test(typeRaw)) standardType = 'Content Corner';
        else if (/discuss/i.test(typeRaw)) standardType = 'Discussion Goal';
        else if (/assessment/i.test(typeRaw)) standardType = 'Assessment Opportunity';
        else if (/ethics/i.test(typeRaw)) standardType = 'Ethics Opportunity';

        const body = calloutMatch[2] || (lines[i + 1] || '');
        if (!calloutMatch[2] && lines[i + 1]) i++;

        currentSection.callouts.push({
          type: standardType,
          body: body.trim()
        });
        continue;
      }

      // Fill in modes
      if (currentMode === 'objectives') {
        const cleaned = line.replace(/^[-*•\d.]+\s*/, '').trim();
        if (cleaned) objectives.push(cleaned);
      } else if (currentMode === 'prep') {
        preparation += (preparation ? '\n' : '') + line;
      } else if (currentMode === 'vocab') {
        const vMatch = line.match(/^[-*•]?\s*([A-Za-z\s-]+)[:–-]\s*(.+)$/);
        if (vMatch) {
          vocabulary.push({ word: vMatch[1].trim(), definition: vMatch[2].trim() });
        } else {
          vocabulary.push({ word: line.replace(/^[-*•\s]*/, ''), definition: '' });
        }
      } else if (currentMode === 'activity' && currentSection) {
        currentSection.body += (currentSection.body ? '\n\n' : '') + line;
      } else {
        teacherOverview += (teacherOverview ? '\n\n' : '') + line;
        studentOverview += (studentOverview ? '\n\n' : '') + line;
      }
    }

    if (activities.length === 0) {
      activities.push({
        id: 'act-1',
        title: 'Core Activity',
        duration: 45,
        sections: [
          {
            id: 'sec-1',
            title: 'Instruction & Practice',
            duration: 45,
            body: rawText,
            remarks: false,
            callouts: []
          }
        ]
      });
    }

    return {
      title,
      teacherOverview: teacherOverview || 'Students explore key computer science concepts through hands-on practice and guided discussion.',
      studentOverview: studentOverview || 'Discover and practice core computer science concepts with interactive challenges.',
      objectives: objectives.length ? objectives : ['Explore key concepts and complete lesson programming tasks.'],
      preparation: preparation || 'Ensure all student devices have internet access and browser open.',
      vocabulary,
      activities,
      aiSource: 'Heuristic Curriculum Parser'
    };
  }

  /**
   * AI Curriculum Quality & Alignment Auditor
   */
  static async auditCurriculum(lesson) {
    const totalDuration = (lesson.activities || []).reduce((sum, a) => sum + (Number(a.duration) || 0), 0);
    const sectionCount = (lesson.activities || []).reduce((sum, a) => sum + (a.sections?.length || 0), 0);
    const calloutCount = (lesson.activities || []).flatMap(a => a.sections || []).flatMap(s => s.callouts || []).length;
    const objectivesCount = lesson.frontMatter?.objectives?.length || lesson.objectives?.length || 0;

    const issues = [];
    const strengths = [];
    let score = 100;

    // 1. Objectives check
    if (objectivesCount === 0) {
      issues.push({
        type: 'critical',
        category: 'Learning Objectives',
        message: 'No learning objectives found. Standards-aligned lessons require at least 1-3 measurable objectives.'
      });
      score -= 25;
    } else if (objectivesCount > 5) {
      issues.push({
        type: 'warning',
        category: 'Cognitive Load',
        message: `${objectivesCount} objectives may overwhelm students for a single lesson. Recommended: 2 to 4 focused objectives.`
      });
      score -= 10;
    } else {
      strengths.push(`Well-scoped learning objectives (${objectivesCount} defined).`);
    }

    // 2. Timing balance check
    if (totalDuration === 0) {
      issues.push({
        type: 'warning',
        category: 'Pacing',
        message: 'Lesson has no assigned activity durations. Estimate minutes for classroom planning.'
      });
      score -= 15;
    } else if (totalDuration < 30 || totalDuration > 90) {
      issues.push({
        type: 'advisory',
        category: 'Pacing',
        message: `Total duration is ${totalDuration} minutes. Standard class periods are typically 45–60 minutes.`
      });
      score -= 5;
    } else {
      strengths.push(`Balanced classroom duration (${totalDuration} minutes).`);
    }

    // 3. Callout balance check
    const callouts = (lesson.activities || []).flatMap(a => a.sections || []).flatMap(s => s.callouts || []);
    const hasDiscussion = callouts.some(c => /discuss/i.test(c.type));
    const hasAssessment = callouts.some(c => /assessment/i.test(c.type));
    const hasTips = callouts.some(c => /teaching tip|tip/i.test(c.type));

    if (!hasDiscussion) {
      issues.push({
        type: 'advisory',
        category: 'Engagement',
        message: 'No Discussion Goal callouts found. Consider adding a guided discussion question or peer reflection.'
      });
      score -= 5;
    } else {
      strengths.push('Includes structured Discussion Goal callouts.');
    }

    if (!hasAssessment) {
      issues.push({
        type: 'warning',
        category: 'Assessment',
        message: 'No Assessment Opportunity callouts found. Include formative checkpoints to assess student understanding.'
      });
      score -= 10;
    } else {
      strengths.push('Includes targeted Assessment Opportunity callouts.');
    }

    // 4. Overviews check
    const fm = lesson.frontMatter || lesson;
    if (!fm.teacherOverview || fm.teacherOverview.length < 50) {
      issues.push({
        type: 'warning',
        category: 'Teacher Guidance',
        message: 'Teacher Overview is very brief or missing. Provide context on rationale and key concepts.'
      });
      score -= 10;
    }
    if (!fm.studentOverview || fm.studentOverview.length < 30) {
      issues.push({
        type: 'warning',
        category: 'Student Clarity',
        message: 'Student Overview is very brief or missing. State the central challenge in student-friendly terms.'
      });
      score -= 5;
    }

    score = Math.max(20, Math.min(100, score));

    // Optional LLM enhancement for deeper reasoning if available
    let aiInsight = '';
    const caps = await this.detectCapabilities();
    if (caps.activeEngine === 'builtin') {
      try {
        const prompt = `Review this lesson overview:
Title: ${lesson.title}
Objectives: ${JSON.stringify(fm.objectives || [])}
Duration: ${totalDuration} minutes across ${sectionCount} sections.
Provide 2 concise pedagogical recommendations for the curriculum developer.`;
        const res = await this.executePrompt({
          systemInstruction: 'You are a master computer science educator.',
          prompt
        });
        if (res.text) aiInsight = res.text.trim();
      } catch {
        // Ignored, heuristic report remains
      }
    }

    return {
      score,
      grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : 'Needs Review',
      totalDuration,
      sectionCount,
      calloutCount,
      objectivesCount,
      strengths,
      issues,
      aiInsight
    };
  }

  /**
   * AI Vocabulary Definition Generator
   */
  static async generateVocabDefinitions(text) {
    const sysPrompt = 'You are a CS educator. Identify 3 to 6 technical or curriculum vocabulary terms in the text and write clear, kid-friendly definitions.';
    const prompt = `Text:\n${text}\n\nFormat as JSON list: [{"word": "...", "definition": "..."}]`;

    const res = await this.executePrompt({ systemInstruction: sysPrompt, prompt });
    if (res.text) {
      try {
        const jsonMatch = res.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
      } catch {}
    }

    // No AI answer: return nothing rather than made-up terms unrelated to the lesson.
    return [];
  }

  /**
   * AI Discussion & Misconception Generator
   */
  static async generateDiscussionPrompts(sectionTitle, sectionBody) {
    const sysPrompt = 'You are an instructional coach. Given this lesson section, provide: 1) One opening discussion prompt, 2) One probe to deepen student reasoning, 3) One common student misconception and how to address it.';
    const prompt = `Section: ${sectionTitle}\nContent: ${sectionBody}`;

    const res = await this.executePrompt({ systemInstruction: sysPrompt, prompt });
    if (res.text) {
      return res.text.trim();
    }

    return `### Discussion Prompts for "${sectionTitle}"\n- **Opening Prompt:** "What surprised you most about how this works, and what would happen if we changed the initial inputs?"\n- **Deepening Probe:** "Can anyone explain why our solution behaves differently in edge cases?"\n- **Common Misconception:** Students often assume computers make intuitive judgments rather than following exact programmed conditions. Remind students to trace step-by-step logic.`;
  }

  /**
   * AI Plain English Staging Explainer
   */
  static explainPlan(plan) {
    if (!plan || !plan.operations) return 'No transfer operations found.';
    const ops = plan.operations;
    const additions = ops.filter(o => o.kind === 'append' || o.before === null);
    const updates = ops.filter(o => o.kind !== 'append' && o.before !== null);
    const decisions = ops.filter(o => o.requiresDecision);

    const lines = [];
    lines.push(`### Staging Summary (${ops.length} Total Changes)`);
    if (additions.length) {
      lines.push(`- **Additions (${additions.length}):** Adds ${additions.map(a => `"${a.label}"`).slice(0, 3).join(', ')}${additions.length > 3 ? ` and ${additions.length - 3} more` : ''}.`);
    }
    if (updates.length) {
      lines.push(`- **Updates (${updates.length}):** Modifies ${updates.map(u => `"${u.label}"`).slice(0, 3).join(', ')}${updates.length > 3 ? ` and ${updates.length - 3} more` : ''}.`);
    }
    if (decisions.length) {
      lines.push(`- **Decisions Required (${decisions.length}):** Needs your confirmation to either keep existing destination text or overwrite with draft.`);
    }
    if (plan.preserved?.length) {
      lines.push(`- **Safe & Preserved:** ${plan.preserved.length} existing destination fields, progressions, and settings will remain completely untouched.`);
    }

    return lines.join('\n');
  }
}
