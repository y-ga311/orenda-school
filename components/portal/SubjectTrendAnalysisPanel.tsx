"use client";

import {
  formatPassRateProbability,
  getPassRateAbcdLabel,
  type PassRateAbcdGrade,
} from "@/lib/passRateAnalysis";
import {
  getSubjectTrendApproachLabel,
  type SubjectTrendAnalysis,
  type SubjectTrendApproachLevel,
} from "@/lib/subjectTrendAnalysis";

type SubjectTrendAnalysisPanelProps = {
  analysis: SubjectTrendAnalysis | null | undefined;
  subjectName: string;
  isLoading?: boolean;
  expanded?: boolean;
};

const ABCD_TONE: Record<
  PassRateAbcdGrade,
  { background: string; border: string; text: string }
> = {
  A: { background: "#dcfce7", border: "#86efac", text: "#166534" },
  B: { background: "#dbeafe", border: "#93c5fd", text: "#1d4ed8" },
  C: { background: "#fef9c3", border: "#fde047", text: "#a16207" },
  D: { background: "#fee2e2", border: "#fca5a5", text: "#b91c1c" },
};

const APPROACH_TONE: Record<SubjectTrendApproachLevel, { background: string; text: string }> = {
  rising: { background: "#dcfce7", text: "#166534" },
  strengthen: { background: "#fee2e2", text: "#b91c1c" },
  caution: { background: "#fef9c3", text: "#a16207" },
  watch: { background: "#f1f5f9", text: "#475569" },
};

function formatMethodLabel(method: SubjectTrendAnalysis["method"]) {
  switch (method) {
    case "simple":
      return "分布比較";
    case "model":
      return "ロジスティック回帰";
    case "blended":
      return "分布比較＋回帰（合成）";
    default:
      return null;
  }
}

function formatLatestSourceLabel(sourceType: SubjectTrendAnalysis["latestSourceType"]) {
  if (sourceType === "regular") {
    return "定期試験";
  }
  if (sourceType === "mock") {
    return "模擬試験";
  }
  return null;
}

export function SubjectTrendAnalysisPanel({
  analysis,
  subjectName,
  isLoading = false,
  expanded = false,
}: SubjectTrendAnalysisPanelProps) {
  if (isLoading) {
    return (
      <section
        className={`subjectTrendAnalysisPanel${expanded ? " subjectTrendAnalysisPanelExpanded" : ""}`}
      >
        <h3 className="examScoreSectionTitle">科目別 ABCD 分析</h3>
        <p className="examPassRateEmpty">読み込み中...</p>
      </section>
    );
  }

  if (!analysis) {
    return null;
  }

  const abcdTone = analysis.abcdGrade ? ABCD_TONE[analysis.abcdGrade] : null;
  const methodLabel = formatMethodLabel(analysis.method);
  const approachTone =
    analysis.trendApproach !== null ? APPROACH_TONE[analysis.trendApproach] : null;
  const latestSourceLabel = formatLatestSourceLabel(analysis.latestSourceType);

  return (
    <section
      className={`subjectTrendAnalysisPanel${expanded ? " subjectTrendAnalysisPanelExpanded" : ""}`}
    >
      <div className="examPassRateHeader">
        <h3 className="examScoreSectionTitle">科目別 ABCD 分析</h3>
        <p className="examPassRateDescription">
          {subjectName}の最新成績と、同科目・同試験時点の卒業生合否データから推定しています。
        </p>
      </div>

      {!analysis.available ? (
        <p className="examPassRateEmpty">{analysis.reason ?? "分析できません。"}</p>
      ) : (
        <>
          <div className="examPassRateSummaryGrid">
            <div
              className="examPassRateAbcdCard"
              style={
                abcdTone
                  ? {
                      backgroundColor: abcdTone.background,
                      borderColor: abcdTone.border,
                    }
                  : undefined
              }
            >
              <span className="examPassRateAbcdLabel">ABCD</span>
              <strong
                className="examPassRateAbcdValue"
                style={abcdTone ? { color: abcdTone.text } : undefined}
              >
                {analysis.abcdGrade ? getPassRateAbcdLabel(analysis.abcdGrade) : "—"}
              </strong>
            </div>
            <div className="examPassRateMetricCard">
              <span className="examPassRateMetricLabel">予測合格率</span>
              <strong className="examPassRateMetricValue">
                {formatPassRateProbability(analysis.passProbability)}
              </strong>
              {methodLabel ? (
                <span className="examPassRateMetricSub">算出: {methodLabel}</span>
              ) : null}
            </div>
            <div className="examPassRateMetricCard">
              <span className="examPassRateMetricLabel">最新成績</span>
              <strong className="examPassRateMetricValue">
                {analysis.latestDisplay ?? "—"}
              </strong>
              <span className="examPassRateMetricSub">
                合格者平均{" "}
                {analysis.passedAverageAtLatest !== null
                  ? `${Math.round(analysis.passedAverageAtLatest * 10) / 10}%`
                  : "—"}
                {" / "}
                ギャップ{" "}
                {analysis.latestGap !== null
                  ? `${analysis.latestGap > 0 ? "+" : ""}${Math.round(analysis.latestGap * 10) / 10}pt`
                  : "—"}
              </span>
            </div>
            {analysis.trendApproach !== null && approachTone ? (
              <div className="examPassRateMetricCard">
                <span className="examPassRateMetricLabel">推移アプローチ</span>
                <span
                  className="examPassRateApproachBadge subjectTrendApproachBadge"
                  style={{
                    backgroundColor: approachTone.background,
                    color: approachTone.text,
                  }}
                >
                  {getSubjectTrendApproachLabel(analysis.trendApproach)}
                </span>
              </div>
            ) : null}
          </div>

          {analysis.latestSessionLabel ? (
            <p className="subjectTrendAnalysisLatestMeta">
              分析基準: {analysis.latestSessionLabel}
              {latestSourceLabel ? `（${latestSourceLabel}）` : ""}
              {analysis.latestExamDateLabel ? ` · ${analysis.latestExamDateLabel}` : ""}
              {" · "}
              卒業生サンプル 合格者 {analysis.graduateSampleCount.passed}名 / 不合格者{" "}
              {analysis.graduateSampleCount.failed}名
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
