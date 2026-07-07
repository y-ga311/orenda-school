"use client";

import { useState } from "react";
import { ExamQuestionCountView } from "@/components/portal/ExamQuestionCountView";
import { RegularExamTermSettings } from "@/components/portal/RegularExamTermSettings";

type ExamSettingsTab = "mock" | "regular";

const TAB_OPTIONS: { value: ExamSettingsTab; label: string }[] = [
  { value: "mock", label: "模擬試験・卒業試験" },
  { value: "regular", label: "定期試験" },
];

export function ExamSettingsView() {
  const [activeTab, setActiveTab] = useState<ExamSettingsTab>("mock");

  return (
    <div className="examSettingsPage">
      <header className="examQuestionCountHeader">
        <div>
          <h1 className="examQuestionCountTitle">試験設定</h1>
          <p className="examQuestionCountSubtitle">
            模擬・卒業試験の問題数と、定期試験の実施日を管理します
          </p>
        </div>
      </header>

      <div className="examSettingsTabRow">
        {TAB_OPTIONS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`examSettingsTab${activeTab === tab.value ? " examSettingsTabActive" : ""}`}
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "mock" ? (
        <ExamQuestionCountView embedded />
      ) : (
        <RegularExamTermSettings />
      )}
    </div>
  );
}
