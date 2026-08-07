// Quiz engine: answer normalization + fuzzy matching + the fact-checked question set.
// In SECURE mode the DB holds `accepted`/`explanation` and validates answers; the
// client only ever sees `PublicQuestion`. In LOCAL/demo mode these defaults are used
// and checked client-side (insecure — demo only).

export interface Question {
  id: string;
  prompt: string;
  accepted: string[]; // hidden server-side in secure mode
  hint?: string;
  explanation: string; // revealed only after answering
}

export type PublicQuestion = Pick<Question, "id" | "prompt" | "hint">;
export const toPublic = (q: Question): PublicQuestion => ({
  id: q.id,
  prompt: q.prompt,
  hint: q.hint,
});

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

export function checkAnswer(input: string, accepted: string[]): boolean {
  const n = normalize(input);
  if (!n) return false;
  return accepted.some((a) => {
    const na = normalize(a);
    if (!na) return false;
    if (n === na) return true;
    // typo tolerance only for reasonably long answers (avoid 'gen' ~ 'den' collisions)
    return na.length >= 4 && levenshtein(n, na) <= 1;
  });
}

// Fact-checked against docs.genlayer.com and genlayer.com/news (2026-08-07).
export const DEFAULT_QUESTIONS: Question[] = [
  {
    id: "q1",
    prompt: "GenLayer's AI-powered smart contracts are called ___ Contracts.",
    accepted: ["intelligent", "intelligent contracts", "intelligent contract"],
    hint: 'Not "smart" — something cleverer.',
    explanation: "They're Intelligent Contracts — able to reason over real-world data.",
  },
  {
    id: "q2",
    prompt: "What programming language are Intelligent Contracts written in?",
    accepted: ["python"],
    hint: "Named after a snake; uses the GenVM SDK.",
    explanation: "Intelligent Contracts are written in Python using the GenVM SDK.",
  },
  {
    id: "q3",
    prompt: "Validators connect directly to these AI models to reason (3-letter abbr.).",
    accepted: ["llm", "llms", "large language model", "large language models"],
    hint: "GPT and LLaMA are examples.",
    explanation: "Validators connect to Large Language Models (LLMs).",
  },
  {
    id: "q4",
    prompt: "GenLayer's Python execution environment / virtual machine is called ___.",
    accepted: ["genvm", "gen vm"],
    hint: "Gen + two letters.",
    explanation: "The GenVM runs Intelligent Contracts and talks to LLMs and the web.",
  },
  {
    id: "q5",
    prompt: "Name GenLayer's consensus mechanism (two words).",
    accepted: ["optimistic democracy"],
    hint: "Hopeful + a form of government.",
    explanation: "Optimistic Democracy — an enhanced Delegated Proof of Stake model.",
  },
  {
    id: "q6",
    prompt: "GenLayer's incentivized testnet is named after which sci-fi author?",
    accepted: ["asimov", "isaac asimov", "testnet asimov"],
    hint: 'Wrote "I, Robot".',
    explanation: 'Testnet Asimov — "the Court of the Internet" — launched June 19, 2025.',
  },
  {
    id: "q7",
    prompt: "GenLayer's native token ticker (3 letters).",
    accepted: ["gen", "$gen"],
    hint: "First three letters of the project.",
    explanation: "The native token is GEN.",
  },
  {
    id: "q8",
    prompt:
      "Which principle lets validators agree on non-deterministic (LLM) results without identical outputs? (two words)",
    accepted: ["equivalence principle", "equivalence", "the equivalence principle"],
    hint: 'Results only need to be "equivalent".',
    explanation:
      "The Equivalence Principle — consensus on equivalent, not byte-identical, results.",
  },
  {
    id: "q9",
    prompt: "In Optimistic Democracy, the validator that proposes the initial outcome is the ___.",
    accepted: ["leader", "the leader", "leader validator"],
    hint: "Others recompute and approve/deny its proposal.",
    explanation: "A randomly chosen Leader proposes; other validators recompute and vote.",
  },
  {
    id: "q10",
    prompt: "Optimistic Democracy is an enhanced version of which staking consensus? (abbr. or full)",
    accepted: ["dpos", "delegated proof of stake", "delegated proof-of-stake", "proof of stake"],
    hint: "Delegated Proof of ______.",
    explanation:
      "It enhances Delegated Proof of Stake (dPoS), inspired by Condorcet's Jury Theorem.",
  },
];
