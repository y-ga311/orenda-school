"use client";

import { useEffect, useMemo, useState } from "react";
import { formatStudyMinutes } from "@/lib/studyRecordDisplay";
import type { StudyPeriod } from "@/lib/studyRecords";
import type {
  ClassSubjectTotal,
  RankingEntry,
  SubjectLeader,
} from "@/lib/studyRanking";

const rankingPeriodOptions = [
  { id: "today", label: "今日" },
  { id: "week", label: "週間" },
  { id: "month", label: "月間" },
  { id: "year", label: "年間" },
  { id: "total", label: "全期間" },
] as const satisfies ReadonlyArray<{ id: StudyPeriod; label: string }>;

const periodDescription: Record<StudyPeriod, string> = {
  today: "今日",
  week: "週間",
  month: "月間",
  year: "年間",
  total: "全期間",
};

export type StudyTimeRankingViewProps = {
  classOptions: string[];
};

type RankingData = {
  selectedPeriod: StudyPeriod;
  selectedClass: string;
  selectedSubject: string;
  classOptions: string[];
  subjectOptions: string[];
  entries: RankingEntry[];
  classSubjectTotals: ClassSubjectTotal[];
  subjectLeaders: SubjectLeader[];
};

function getRankingErrorMessage(status: number, message?: string) {
  if (status === 401) {
    return "ログインが必要です。";
  }
  if (status === 500) {
    return message ?? "ランキングの取得中にエラーが発生しました。";
  }
  return message ?? "ランキングの取得に失敗しました。";
}

function SubjectStackedBar({
  breakdown,
}: {
  breakdown: RankingEntry["subjectBreakdown"];
}) {
  const total = breakdown.reduce((sum, item) => sum + item.minutes, 0);

  if (total <= 0) {
    return <div className="rankingSubjectBar rankingSubjectBarEmpty" aria-hidden="true" />;
  }

  return (
    <div className="rankingSubjectBar" aria-hidden="true">
      <div className="rankingSubjectBarInner">
        {breakdown.map((item) => (
          <div
            key={item.subjectName}
            className="rankingSubjectBarSegment"
            style={{
              width: `${(item.minutes / total) * 100}%`,
              backgroundColor: item.color,
            }}
            title={`${item.subjectName}: ${formatStudyMinutes(item.minutes)}`}
          />
        ))}
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const className =
    rank === 1
      ? "rankingRankBadge rankingRankBadgeGold"
      : rank === 2
        ? "rankingRankBadge rankingRankBadgeSilver"
        : rank === 3
          ? "rankingRankBadge rankingRankBadgeBronze"
          : "rankingRankBadge";

  return (
    <span className={className}>
      <span>{rank}</span>
    </span>
  );
}

function PodiumCard({
  rank,
  entry,
}: {
  rank: 1 | 2 | 3;
  entry: RankingEntry | undefined;
}) {
  const cardClass =
    rank === 1
      ? "rankingPodiumCard rankingPodiumCardFirst"
      : rank === 2
        ? "rankingPodiumCard rankingPodiumCardSecond"
        : "rankingPodiumCard rankingPodiumCardThird";

  if (!entry) {
    return (
      <div className={`${cardClass} rankingPodiumCardEmpty`}>
        <span className="rankingPodiumRank">{rank}位</span>
        <span className="rankingPodiumName">—</span>
        <span className="rankingPodiumTime">—</span>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <span className="rankingPodiumRank">{rank}位</span>
      <span className="rankingPodiumName">{entry.name}</span>
      <strong className="rankingPodiumTime">
        {formatStudyMinutes(entry.totalMinutes)}
      </strong>
      <SubjectStackedBar breakdown={entry.subjectBreakdown} />
    </div>
  );
}

export function StudyTimeRankingView({ classOptions }: StudyTimeRankingViewProps) {
  const [period, setPeriod] = useState<StudyPeriod>("month");
  const [classFilter, setClassFilter] = useState(
    classOptions[0] ? classOptions[0] : "all",
  );
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [data, setData] = useState<RankingData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (classOptions.length === 0) {
      setClassFilter("all");
      return;
    }
    if (classFilter !== "all" && !classOptions.includes(classFilter)) {
      setClassFilter(classOptions[0]);
    }
  }, [classFilter, classOptions]);

  useEffect(() => {
    let cancelled = false;

    async function loadRanking() {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        period,
        class: classFilter,
        subject: subjectFilter,
      });

      try {
        const response = await fetch(`/api/study-ranking?${params.toString()}`);
        const payload = (await response.json()) as RankingData & { message?: string };

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setError(getRankingErrorMessage(response.status, payload.message));
          setData(null);
          return;
        }

        setData(payload);
        if (
          subjectFilter !== "all" &&
          !payload.subjectOptions.includes(subjectFilter)
        ) {
          setSubjectFilter("all");
        }
      } catch {
        if (!cancelled) {
          setError("ランキングの取得に失敗しました。");
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadRanking();

    return () => {
      cancelled = true;
    };
  }, [period, classFilter, subjectFilter]);

  const entries = data?.entries ?? [];
  const topThree = useMemo(() => {
    return {
      first: entries.find((entry) => entry.rank === 1),
      second: entries.find((entry) => entry.rank === 2),
      third: entries.find((entry) => entry.rank === 3),
    };
  }, [entries]);

  const classSubjectTotals = data?.classSubjectTotals ?? [];
  const subjectLeaders = data?.subjectLeaders ?? [];
  const maxClassSubjectMinutes = classSubjectTotals[0]?.minutes ?? 0;
  const subjectOptions = data?.subjectOptions ?? [];
  const periodLabel = periodDescription[period];

  return (
    <div className="rankingPage">
      <header className="rankingHeader">
        <div>
          <h1 className="rankingTitle">学習時間ランキング</h1>
        </div>
      </header>

      <section className="rankingPanel">
        <div className="rankingPanelHeader">
          <p className="rankingPanelSubtitle">クラス・期間・科目別の学習時間順位</p>
          <div className="rankingFilters">
            <label className="rankingSelectWrap">
              <select
                className="rankingSelect"
                value={classFilter}
                onChange={(event) => setClassFilter(event.target.value)}
                aria-label="クラス"
              >
                <option value="all">すべてのクラス</option>
                {classOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="rankingSelectWrap">
              <select
                className="rankingSelect"
                value={subjectFilter}
                onChange={(event) => setSubjectFilter(event.target.value)}
                aria-label="科目"
              >
                <option value="all">すべての科目</option>
                {subjectOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="rankingPeriodTabs" aria-label="表示する期間">
          {rankingPeriodOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`rankingPeriodTab${period === option.id ? " rankingPeriodTabActive" : ""}`}
              onClick={() => setPeriod(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {error ? <p className="loginError">{error}</p> : null}

        <div className="rankingContentRow">
          <div className="rankingMainColumn">
            <div className="rankingPodium">
              <PodiumCard rank={2} entry={topThree.second} />
              <PodiumCard rank={1} entry={topThree.first} />
              <PodiumCard rank={3} entry={topThree.third} />
            </div>

            <div className="rankingTableWrap">
              <div className="rankingTableHeader" aria-hidden="true">
                <span>順位</span>
                <span>学生名</span>
                <span>科目内訳</span>
                <span>クラス</span>
                <span>合計時間</span>
                <span>学習日数</span>
                <span>平均/日</span>
              </div>

              {isLoading ? (
                <p className="rankingEmpty">読み込み中...</p>
              ) : entries.length === 0 ? (
                <p className="rankingEmpty">表示できるランキングがありません。</p>
              ) : (
                entries.map((entry) => (
                  <div
                    key={entry.gakuseiId}
                    className={`rankingTableRow${entry.rank === 1 ? " rankingTableRowTop" : ""}`}
                  >
                    <RankBadge rank={entry.rank} />
                    <span className="rankingTableName">{entry.name}</span>
                    <SubjectStackedBar breakdown={entry.subjectBreakdown} />
                    <span className="rankingTableMeta rankingTableMetaClass">
                      {entry.class}
                    </span>
                    <strong className="rankingTableTotal">
                      {formatStudyMinutes(entry.totalMinutes)}
                    </strong>
                    <span className="rankingTableMeta rankingTableMetaDays">
                      {entry.studiedDays}日
                    </span>
                    <span className="rankingTableMeta rankingTableMetaAvg">
                      {formatStudyMinutes(entry.averageMinutes)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <aside className="rankingSubjectPanel" aria-label="科目別学習時間">
            <h2 className="rankingSubjectPanelTitle">科目別学習時間</h2>
            <p className="rankingSubjectPanelDesc">
              クラス合計（{periodLabel}）
            </p>

            {isLoading ? (
              <p className="rankingEmpty">読み込み中...</p>
            ) : classSubjectTotals.length === 0 ? (
              <p className="rankingEmpty">データがありません。</p>
            ) : (
              <>
                <div className="rankingClassSubjectList">
                  {classSubjectTotals.map((subject) => (
                    <div key={subject.subjectName} className="rankingClassSubjectItem">
                      <div className="rankingClassSubjectLabelRow">
                        <span>{subject.subjectName}</span>
                        <strong>{formatStudyMinutes(subject.minutes)}</strong>
                      </div>
                      <div className="rankingClassSubjectBar">
                        <div
                          className="rankingClassSubjectBarFill"
                          style={{
                            width:
                              maxClassSubjectMinutes > 0
                                ? `${(subject.minutes / maxClassSubjectMinutes) * 100}%`
                                : "0%",
                            backgroundColor: subject.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rankingSubjectLegend">
                  {classSubjectTotals.slice(0, 5).map((subject) => (
                    <span key={subject.subjectName} className="rankingSubjectLegendItem">
                      <i style={{ backgroundColor: subject.color }} aria-hidden="true" />
                      {subject.subjectName}
                    </span>
                  ))}
                </div>

                <h3 className="rankingSubjectLeadersTitle">科目別 上位</h3>
                <div className="rankingSubjectLeadersList">
                  {subjectLeaders.length === 0 ? (
                    <p className="rankingEmpty">データがありません。</p>
                  ) : (
                    subjectLeaders.map((leader) => (
                      <div key={leader.subjectName} className="rankingSubjectLeaderRow">
                        <span className="rankingSubjectLeaderSubject">
                          {leader.subjectName}
                        </span>
                        <span className="rankingSubjectLeaderStudent">
                          {leader.studentName} · {formatStudyMinutes(leader.minutes)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
