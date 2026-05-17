import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DetailsHeader,
  DetailsTabs,
  DetailsSection,
  DetailsField,
  DetailsFooter,
} from "@/components/mesh/details";

describe("DetailsHeader", () => {
  it("renders title, pills, meta and actions", () => {
    const html = renderToStaticMarkup(
      <DetailsHeader
        title="nas-01"
        pills={<span>ONLINE</span>}
        meta="10.0.1.12"
        actions={<button type="button">Edit</button>}
      />,
    );
    expect(html).toContain("nas-01");
    expect(html).toContain("ONLINE");
    expect(html).toContain("10.0.1.12");
    expect(html).toContain(">Edit<");
    expect(html).toContain('data-component="mesh-details-header"');
  });
});

describe("DetailsTabs", () => {
  it("marks the active tab with aria-selected=true", () => {
    const html = renderToStaticMarkup(
      <DetailsTabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "activity", label: "Activity", badge: 3, badgeTone: "warning" },
        ]}
        active="activity"
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Overview");
    expect(html).toContain("Activity");
    expect(html).toContain('data-testid="details-tab-overview"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain(">3<"); // badge
  });
});

describe("DetailsSection", () => {
  it("renders title, meta and body", () => {
    const html = renderToStaticMarkup(
      <DetailsSection title="Listening" meta="4 ports">
        port 22
      </DetailsSection>,
    );
    expect(html).toContain("Listening");
    expect(html).toContain("4 ports");
    expect(html).toContain("port 22");
  });
});

describe("DetailsField", () => {
  it("renders label and value", () => {
    const html = renderToStaticMarkup(<DetailsField label="endpoint" value="wss://core.lan" />);
    expect(html).toContain("endpoint");
    expect(html).toContain("wss://core.lan");
  });
});

describe("DetailsFooter", () => {
  it("renders hint and action cluster", () => {
    const html = renderToStaticMarkup(
      <DetailsFooter
        hint="updated 4s ago"
        actions={<button type="button">Ping</button>}
      />,
    );
    expect(html).toContain("updated 4s ago");
    expect(html).toContain(">Ping<");
    expect(html).toContain('data-component="mesh-details-footer"');
  });
});
