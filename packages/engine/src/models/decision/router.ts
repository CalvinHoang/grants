// The engine's DecisionModel: the `decider` role's provider picks the implementation on every call,
// so switching between jev and the LLM stand-in in Settings needs no restart and picks up that
// model's own thresholds (F-16 AC2).
import type { Answer, AskOptions, DecisionModel, Question, StatelessQuestion, Thresholds } from "@gw/shared";
import { deciderSettings, type ModelsStore } from "../config-store";
import { JEV_PROVIDER } from "./jev";

export class DecisionRouter implements DecisionModel {
  readonly #store: ModelsStore;
  readonly #jev: DecisionModel;
  readonly #standIn: DecisionModel;

  constructor(store: ModelsStore, jev: DecisionModel, standIn: DecisionModel) {
    this.#store = store;
    this.#jev = jev;
    this.#standIn = standIn;
  }

  /** Which implementation answers now: "jev" or "llm". */
  get implementation(): "jev" | "llm" {
    return this.#store.get().roles.decider.provider === JEV_PROVIDER ? "jev" : "llm";
  }

  /** Thresholds of the decision model in use now (§8 threshold rule: per implementation and kind). */
  thresholds(): Thresholds {
    return deciderSettings(this.#store.get()).thresholds;
  }

  stateLimitTokens(): number {
    return deciderSettings(this.#store.get()).stateLimitTokens;
  }

  ask(question: Question, options?: AskOptions): Promise<Answer> {
    return this.#current().ask(question, options);
  }

  askMany(state: string, questions: StatelessQuestion[], options?: AskOptions): Promise<Answer[]> {
    return this.#current().askMany(state, questions, options);
  }

  #current(): DecisionModel {
    return this.implementation === "jev" ? this.#jev : this.#standIn;
  }
}
