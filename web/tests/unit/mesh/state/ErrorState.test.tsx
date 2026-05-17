import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorState } from "@/components/mesh/state/ErrorState";

describe("ErrorState", () => {
  it("renders title and message", () => {
    const html = renderToStaticMarkup(
      <ErrorState
        title="Couldn't reach MikroTik"
        message="RouterOS REST returned 502 — auto-retry in 4s."
      />,
    );
    expect(html).toContain("Couldn&#x27;t reach MikroTik");
    expect(html).toContain("RouterOS REST returned 502");
  });

  it("renders a Try again button when onRetry is provided", () => {
    const html = renderToStaticMarkup(
      <ErrorState
        title="Failed"
        message="…"
        onRetry={() => {
          /* noop */
        }}
      />,
    );
    expect(html).toContain('data-action="retry"');
    expect(html).toContain("Try again");
  });

  it("does not render a retry button when neither onRetry nor action is set", () => {
    const html = renderToStaticMarkup(
      <ErrorState title="Failed" message="…" />,
    );
    expect(html).not.toContain('data-action="retry"');
  });

  it("renders the stale-content overlay when staleContent is supplied", () => {
    const html = renderToStaticMarkup(
      <ErrorState
        title="Stale"
        message="…"
        staleContent={<div data-testid="last-good">Last good data</div>}
      />,
    );
    expect(html).toContain("Last good data");
    expect(html).toContain('data-component="mesh-error-stale-overlay"');
  });

  it("renders inline variant without stale overlay slot", () => {
    const html = renderToStaticMarkup(
      <ErrorState title="Stale" message="…" inline />,
    );
    expect(html).toContain('data-variant="inline"');
    expect(html).not.toContain('data-component="mesh-error-stale-overlay"');
  });
});
