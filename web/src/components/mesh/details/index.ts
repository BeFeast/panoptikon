/**
 * Mesh details drawer — faithful port of `panopticon/project/details.jsx`.
 *
 * Composable drawer chrome shared by route shells that surface a per-entity
 * detail view (devices first, agents/certs next). Compose them as:
 *
 *   <DetailsDrawer open={...} onOpenChange={...}>
 *     <DetailsHeader title="nas-01" pills={...} meta={...} actions={...} />
 *     <DetailsTabs tabs={...} active={...} onChange={...} />
 *     <div className="flex-1 overflow-auto p-4">
 *       <DetailsSection title="Overview">...</DetailsSection>
 *       <DetailsSection title="Listening · 4 ports">...</DetailsSection>
 *     </div>
 *     <DetailsFooter actions={...} />
 *   </DetailsDrawer>
 */

export { DetailsDrawer } from "./DetailsDrawer";
export type { DetailsDrawerProps } from "./DetailsDrawer";

export { DetailsHeader } from "./DetailsHeader";
export type { DetailsHeaderProps } from "./DetailsHeader";

export { DetailsTabs } from "./DetailsTabs";
export type { DetailsTab, DetailsTabsProps } from "./DetailsTabs";

export { DetailsSection } from "./DetailsSection";
export type { DetailsSectionProps } from "./DetailsSection";

export { DetailsField } from "./DetailsField";
export type { DetailsFieldProps } from "./DetailsField";

export { DetailsFooter } from "./DetailsFooter";
export type { DetailsFooterProps } from "./DetailsFooter";
