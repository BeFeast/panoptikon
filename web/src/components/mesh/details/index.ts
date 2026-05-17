/**
 * Mesh detail surfaces — faithful port of `panopticon/project/details.jsx`.
 *
 * Shared vocabulary for entity detail drawers across mesh-direction routes
 * (devices, alerts, agents, assets, ssh-hosts). Wraps the shadcn `Sheet` /
 * `Dialog` primitives (already on mesh tokens after #771) and the mesh atoms
 * shipped in #772 so per-route ports stop re-inventing modal layouts and IA.
 *
 * Pure presentational; no router or data-fetching coupling. Route-level
 * adoption happens in the upcoming U1 / U5 / U6 PRs.
 */

export { DetailsDrawer } from "./DetailsDrawer";
export type {
  DetailsDrawerProps,
  DetailsDrawerSide,
} from "./DetailsDrawer";

export { DetailsHeader } from "./DetailsHeader";
export type { DetailsHeaderProps } from "./DetailsHeader";

export { DetailsTabs } from "./DetailsTabs";
export type { DetailsTabsProps, DetailsTabItem } from "./DetailsTabs";

export { DetailsSection } from "./DetailsSection";
export type { DetailsSectionProps } from "./DetailsSection";

export { DetailsField } from "./DetailsField";
export type { DetailsFieldProps } from "./DetailsField";

export { DetailsFooter } from "./DetailsFooter";
export type { DetailsFooterProps } from "./DetailsFooter";
