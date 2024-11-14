// types are mainly from @skyware/jetstream: https://github.com/skyware-js/jetstream/blob/2ef50bede69ded552d41b601bab41726ad452ea2/src/index.ts#L61
import type { Account, Identity } from "../lexicon/types/com/atproto/sync/subscribeRepos";

/** Resolves a lexicon name to its record operation. */
export type ResolveLexicon<T extends string> = { $type: T };

/**
 * The types of events that are emitted by {@link Jetstream}.
 * @enum
 */
export const EventType = {
	/** A new commit. */
	Commit: "commit",
	/** An account's status was updated. */
	Account: "account",
	/** An account's identity was updated. */
	Identity: "identity",
} as const;
export type EventType = typeof EventType[keyof typeof EventType];

/**
 * The types of commits that can be received.
 * @enum
 */
export const CommitType = {
	/** A record was created. */
	Create: "create",
	/** A record was updated. */
	Update: "update",
	/** A record was deleted. */
	Delete: "delete",
} as const;
export type CommitType = typeof CommitType[keyof typeof CommitType];

/**
 * The base operation for events emitted by the {@link Jetstream} class.
 */
export interface EventBase {
	did: string;
	time_us: number;
	kind: EventType;
}

/**
 * A commit event. Represents a commit to a user repository.
 */
export interface CommitEvent<RecordType extends string> extends EventBase {
	kind: typeof EventType.Commit;
	commit: Commit<RecordType>;
}

/**
 * An account event. Represents a change to an account's status on a host (e.g. PDS or Relay).
 */
export interface AccountEvent extends EventBase {
	kind: typeof EventType.Account;
	account: Account;
}

/**
 * An identity event. Represents a change to an account's identity.
 */
export interface IdentityEvent extends EventBase {
	kind: typeof EventType.Identity;
	identity: Identity;
}

/**
 * The base operation for commit events.
 */
export interface CommitBase<RecordType extends string> {
	operation: CommitType;
	rev: string;
	collection: RecordType;
	rkey: string;
}

/**
 * A commit event representing a new record.
 */
export interface CommitCreate<RecordType extends string> extends CommitBase<RecordType> {
	operation: typeof CommitType.Create;
	record: ResolveLexicon<RecordType>;
	cid: string;
}

/**
 * A commit event representing an update to an existing record.
 */
export interface CommitUpdate<RecordType extends string> extends CommitBase<RecordType> {
	operation: typeof CommitType.Update;
	record: ResolveLexicon<RecordType>;
	cid: string;
}

/**
 * A commit event representing a deletion of an existing record.
 */
export interface CommitDelete<RecordType extends string> extends CommitBase<RecordType> {
	operation: typeof CommitType.Delete;
}

/**
 * A commit event.
 */
export type Commit<RecordType extends string> =
	| CommitCreate<RecordType>
	| CommitUpdate<RecordType>
	| CommitDelete<RecordType>;
