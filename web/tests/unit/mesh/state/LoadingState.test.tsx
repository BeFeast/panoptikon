import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LoadingState } from "@/components/mesh/state/LoadingState";

describe("LoadingState", () => {
  it("renders the requested tile and row counts", () => {
    const html = renderToStaticMarkup(
      <LoadingState tiles={3} rows={4} />,
    );
    // 3 tiles + 4 rows × 4 cells = 16 row skeletons + 1 default header skeleton + 1 default subhead skeleton
    const skeletonCount = (html.match(/animate-shimmer/g) ?? []).length;
    expect(skeletonCount).toBeGreaterThanOrEqual(3 + 4 * 4);
    // grid template echoes tile count
    expect(html).toContain("repeat(3, 1fr)");
  });

  it("renders title + message when supplied", () => {
    const html = renderToStaticMarkup(
      <LoadingState title="Devices" message="Pulling live inventory" tiles={0} rows={0} />,
    );
    expect(html).toContain("Devices");
    expect(html).toContain("Pulling live inventory");
  });

  it("omits tile / row blocks when set to 0", () => {
    const html = renderToStaticMarkup(
      <LoadingState tiles={0} rows={0} />,
    );
    expect(html).not.toContain("repeat(0");
  });

  it("renders the inline variant as a single bar", () => {
    const html = renderToStaticMarkup(<LoadingState inline />);
    expect(html).toContain('data-variant="inline"');
  });
});
