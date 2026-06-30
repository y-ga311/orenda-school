"use client";

import { useState } from "react";
import { MedalSettingsView } from "@/components/portal/MedalSettingsView";
import { MultipleChoiceQuestionsView } from "@/components/portal/MultipleChoiceQuestionsView";
import { NationalExamScheduleView } from "@/components/portal/NationalExamScheduleView";
import { TeacherQuestView } from "@/components/portal/TeacherQuestView";
import {
  DEFAULT_ORENDA_EDIT_TAB,
  ORENDA_EDIT_TABS,
  type OrendaEditTabKey,
} from "@/lib/orendaEdit";

function OrendaEditTabPlaceholder({ tabLabel }: { tabLabel: string }) {
  return (
    <div className="orendaEditPlaceholder">
      <p className="orendaEditPlaceholderTitle">{tabLabel}</p>
      <p className="orendaEditPlaceholderText">このタブの画面は後ほど実装します。</p>
    </div>
  );
}

export function OrendaEditView() {
  const [activeTab, setActiveTab] = useState<OrendaEditTabKey>(DEFAULT_ORENDA_EDIT_TAB);
  const activeTabDef = ORENDA_EDIT_TABS.find((tab) => tab.key === activeTab);

  return (
    <div className="orendaEditPage">
      <header className="orendaEditHeader">
        <h1 className="orendaEditTitle">Orenda編集</h1>
      </header>

      <section className="orendaEditWorkspace" aria-label="Orenda編集ワークスペース">
        <div className="orendaEditTabBar" role="tablist" aria-label="Orenda編集タブ">
          {ORENDA_EDIT_TABS.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                id={`orenda-edit-tab-${tab.key}`}
                aria-selected={isActive}
                aria-controls={`orenda-edit-panel-${tab.key}`}
                className={`orendaEditTab${isActive ? " orendaEditTabActive" : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          className="orendaEditTabPanel"
          role="tabpanel"
          id={`orenda-edit-panel-${activeTab}`}
          aria-labelledby={`orenda-edit-tab-${activeTab}`}
        >
          {activeTab === "multipleChoice" ? (
            <MultipleChoiceQuestionsView />
          ) : activeTab === "teacherQuest" ? (
            <TeacherQuestView />
          ) : activeTab === "medalSettings" ? (
            <MedalSettingsView />
          ) : activeTab === "nationalExamSchedule" ? (
            <NationalExamScheduleView />
          ) : (
            <OrendaEditTabPlaceholder tabLabel={activeTabDef?.label ?? "Orenda編集"} />
          )}
        </div>
      </section>
    </div>
  );
}
