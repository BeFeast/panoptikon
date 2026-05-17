/**
 * Mesh state surfaces — faithful port of `panopticon/project/states.jsx`.
 *
 * The three non-success states every route ships with:
 *
 *   - `EmptyState`   — central "explain the why" placeholder with optional CTA
 *   - `LoadingState` — skeleton ridges that mirror the real layout
 *   - `ErrorState`   — failure banner that keeps last-known data visible
 *
 * These are pure presentational primitives — no data fetching, no router
 * coupling — so route shells can compose them without dragging extra runtime
 * into the leaf. Route-level adoption happens in the upcoming U-series PRs.
 */

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

export { LoadingState } from "./LoadingState";
export type { LoadingStateProps } from "./LoadingState";

export { ErrorState } from "./ErrorState";
export type { ErrorStateProps } from "./ErrorState";
