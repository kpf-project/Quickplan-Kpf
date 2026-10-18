import { CENTER_REPORT_IDS } from "./reportDefinitions";
import { JAM_REPORTS } from "./jamReportDefinitions";
import { LABOR_REPORTS } from "./laborReportDefinitions";
import { OUTPUT_REPORTS } from "./outputReportDefinitions";

export function navigateReport(router, href) {
  const id = new URL(href, window.location.origin).searchParams.get("report");
  if (CENTER_REPORT_IDS.has(id) || JAM_REPORTS[id] || LABOR_REPORTS[id] || OUTPUT_REPORTS[id]) {
    window.history.pushState(null, "", href);
  } else {
    router.push(href, { scroll: false });
  }
}
