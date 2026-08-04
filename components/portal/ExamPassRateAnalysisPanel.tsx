"use client";

import {
  formatPassRateProbability,
  getPassRateAbcdLabel,
  getSubjectApproachLevelLabel,
  type ExamPassRateAnalysis,
  type PassRateAbcdGrade,
  type SubjectApproachLevel,
} from "@/lib/passRateAnalysis";

type ExamPassRateAnalysisPanelProps = {
  analysis: ExamPassRateAnalysis | null | undefined;
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

const APPROACH_TONE: Record<SubjectApproachLevel, { background: string; text: string }> = {
  focus: { background: "#fee2e2", text: "#b91c1c" },
  maintain: { background: "#dcfce7", text: "#166534" },
  watch: { background: "#f1f5f9", text: "#475569" },
};

function formatMethodLabel(method: ExamPassRateAnalysis["method"]) {
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

export function ExamPassRateAnalysisPanel({
  analysis,
  isLoading = false,
  expanded = false,
}: ExamPassRateAnalysisPanelProps) {
  if (isLoading) {
    return (
      <section
        className={`examPassRatePanel${expanded ? " examPassRatePanelExpanded" : ""}`}
      >
        <h3 className="examScoreSectionTitle">国家試験合格率 ABCD 分析</h3>
        <p className="examPassRateEmpty">読み込み中...</p>
      </section>
    );
  }

  if (!analysis) {
    return null;
  }

  const focusSubjects = analysis.subjectApproaches.filter(
    (item) => item.level === "focus",
  );
  const subjectApproaches = analysis.subjectApproaches;
  const abcdTone = analysis.abcdGrade ? ABCD_TONE[analysis.abcdGrade] : null;
  const methodLabel = formatMethodLabel(analysis.method);

  return (
    <section
      className={`examPassRatePanel${expanded ? " examPassRatePanelExpanded" : ""}`}
    >
      <div className="examPassRateHeader">
        <h3 className="examScoreSectionTitle">国家試験合格率 ABCD 分析</h3>
        <p className="examPassRateDescription">
          卒業生の合否データと、選択中試験時点の成績から推定しています。
        </p>
      </div>

      {!analysis.available ? (
        <p className="examPassRateEmpty">{analysis.reason ?? "分析できません。"}</p>
      ) : (
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
            <span className="examPassRateMetricLabel">総合得点率</span>
            <strong className="examPassRateMetricValue">
              {analysis.studentTotalAverage !== null
                ? `${analysis.studentTotalAverage}%`
                : "—"}
            </strong>
            <span className="examPassRateMetricSub">
              合格者平均{" "}
              {analysis.passedAverageTotal !== null
                ? `${Math.round(analysis.passedAverageTotal * 10) / 10}%`
                : "—"}
              {" / "}
              不合格者平均{" "}
              {analysis.failedAverageTotal !== null
                ? `${Math.round(analysis.failedAverageTotal * 10) / 10}%`
                : "—"}
            </span>
          </div>
        </div>
      )}

      {subjectApproaches.length > 0 ? (
        <div className="examPassRateSubjectSection">
          <h4 className="examPassRateSubjectTitle">科目別アプローチ優先度</h4>
          <p className="examPassRateSubjectDescription">
            全科目を合格者平均との差が大きい順に表示しています。
          </p>
          <div className="examPassRateSubjectTableWrap">
            <table className="examPassRateSubjectTable">
              <thead>
                <tr>
                  <th>順位</th>
                  <th>科目</th>
                  <th>本人</th>
                  <th>合格者平均</th>
                  <th>ギャップ</th>
                  <th>判定</th>
                </tr>
              </thead>
              <tbody>
                {subjectApproaches.map((item) => {
                  const tone = APPROACH_TONE[item.level];
                  return (
                    <tr key={item.subjectName}>
                      <td>{item.priorityRank}</td>
                      <td>{item.subjectName}</td>
                      <td>{item.studentScore}%</td>
                      <td>
                        {item.passedAverage !== null ? `${item.passedAverage}%` : "—"}
                      </td>
                      <td>
                        {item.gap !== null
                          ? `${item.gap > 0 ? "+" : ""}${Math.round(item.gap * 10) / 10}pt`
                          : "—"}
                      </td>
                      <td>
                        <span
                          className="examPassRateApproachBadge"
                          style={{
                            backgroundColor: tone.background,
                            color: tone.text,
                          }}
                        >
                          {getSubjectApproachLevelLabel(item.level)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {focusSubjects.length > 0 ? (
            <p className="examPassRateFocusNote">
              要重点: {focusSubjects.map((item) => item.subjectName).join("、")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
