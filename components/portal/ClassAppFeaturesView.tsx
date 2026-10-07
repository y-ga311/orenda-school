"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalLoadingOverlay } from "@/components/portal/PortalLoadingOverlay";
import {
  CLASS_APP_FEATURE_KEYS,
  countEnabledClassAppFeatures,
  createDefaultClassAppFeatures,
  DEFAULT_MENU_ORDER,
  getClassAppFeatureDefinition,
  moveMenuOrderItem,
  type ClassAppFeatureKey,
  type ClassAppFeatures,
  type ClassAppFeaturesRow,
} from "@/lib/classAppFeatures";

type ListResponse = {
  items?: ClassAppFeaturesRow[];
  classNames?: string[];
  tableMissing?: boolean;
  message?: string;
};

type DetailResponse = {
  detail?: ClassAppFeaturesRow;
  tableMissing?: boolean;
  message?: string;
};

function getApiErrorMessage(status: number, message?: string) {
  if (status === 401) {
    return "ログインが必要です。";
  }
  return message ?? "処理中にエラーが発生しました。";
}

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return "未保存";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ja-JP");
}

export function ClassAppFeaturesView() {
  const [items, setItems] = useState<ClassAppFeaturesRow[]>([]);
  const [classNames, setClassNames] = useState<string[]>([]);
  const [selectedClassName, setSelectedClassName] = useState("");
  const [features, setFeatures] = useState<ClassAppFeatures>(createDefaultClassAppFeatures());
  const [menuOrder, setMenuOrder] = useState<ClassAppFeatureKey[]>([...DEFAULT_MENU_ORDER]);
  const [dragKey, setDragKey] = useState<ClassAppFeatureKey | null>(null);
  const [existsInDb, setExistsInDb] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const isBusy = isLoading || isSaving;
  const enabledCount = countEnabledClassAppFeatures(features);

  const selectedSummary = useMemo(() => {
    return items.find((item) => item.className === selectedClassName) ?? null;
  }, [items, selectedClassName]);

  const applyDetail = useCallback((detail: ClassAppFeaturesRow) => {
    setSelectedClassName(detail.className);
    setFeatures(detail.features);
    setMenuOrder(detail.menuOrder);
    setExistsInDb(detail.existsInDb);
    setUpdatedAt(detail.updatedAt);
    setIsDirty(false);
  }, []);

  const loadList = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/class-app-features");
      const payload = (await response.json()) as ListResponse;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      const nextItems = payload.items ?? [];
      const nextClassNames = payload.classNames ?? [];
      setItems(nextItems);
      setClassNames(nextClassNames);
      setTableMissing(Boolean(payload.tableMissing));

      return { items: nextItems, classNames: nextClassNames };
    } catch (loadError) {
      setItems([]);
      setClassNames([]);
      setError(loadError instanceof Error ? loadError.message : "一覧の取得に失敗しました。");
      return { items: [] as ClassAppFeaturesRow[], classNames: [] as string[] };
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const result = await loadList();
      const initial =
        result.items.find((item) => item.className === selectedClassName) ??
        result.items[0] ??
        null;
      if (initial) {
        applyDetail(initial);
      } else if (result.classNames[0]) {
        applyDetail({
          className: result.classNames[0],
          features: createDefaultClassAppFeatures(),
          menuOrder: [...DEFAULT_MENU_ORDER],
          updatedAt: null,
          updatedBy: null,
          existsInDb: false,
        });
      }
    })();
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelectClass(className: string) {
    if (isDirty && !window.confirm("未保存の変更があります。破棄してクラスを切り替えますか？")) {
      return;
    }

    setError(null);
    setMessage(null);

    const found = items.find((item) => item.className === className);
    if (found) {
      applyDetail(found);
      return;
    }

    applyDetail({
      className,
      features: createDefaultClassAppFeatures(),
      menuOrder: [...DEFAULT_MENU_ORDER],
      updatedAt: null,
      updatedBy: null,
      existsInDb: false,
    });
  }

  function handleToggle(key: ClassAppFeatureKey, enabled: boolean) {
    setFeatures((current) => ({ ...current, [key]: enabled }));
    setIsDirty(true);
    setMessage(null);
  }

  function handleMove(key: ClassAppFeatureKey, direction: -1 | 1) {
    setMenuOrder((current) => moveMenuOrderItem(current, key, direction));
    setIsDirty(true);
    setMessage(null);
  }

  function handleDrop(targetKey: ClassAppFeatureKey) {
    if (!dragKey || dragKey === targetKey) {
      setDragKey(null);
      return;
    }

    setMenuOrder((current) => {
      const next = [...current];
      const fromIndex = next.indexOf(dragKey);
      const toIndex = next.indexOf(targetKey);
      if (fromIndex < 0 || toIndex < 0) {
        return current;
      }
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
    setDragKey(null);
    setIsDirty(true);
    setMessage(null);
  }

  function handleResetOrder() {
    setMenuOrder([...DEFAULT_MENU_ORDER]);
    setIsDirty(true);
    setMessage(null);
  }

  function handleEnableAll() {
    setFeatures(createDefaultClassAppFeatures());
    setIsDirty(true);
    setMessage(null);
  }

  function handleDisableAll() {
    const next = { ...createDefaultClassAppFeatures() };
    CLASS_APP_FEATURE_KEYS.forEach((key) => {
      next[key] = false;
    });
    setFeatures(next);
    setIsDirty(true);
    setMessage(null);
  }

  async function handleSave() {
    if (!selectedClassName) {
      setError("クラスを選択してください。");
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/class-app-features", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          className: selectedClassName,
          features,
          menuOrder,
        }),
      });
      const payload = (await response.json()) as DetailResponse;

      if (!response.ok) {
        if (payload.tableMissing) {
          setTableMissing(true);
        }
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      if (payload.detail) {
        applyDetail(payload.detail);
      } else {
        setIsDirty(false);
      }

      const listResult = await loadList();
      const refreshed =
        listResult.items.find((item) => item.className === selectedClassName) ?? payload.detail;
      if (refreshed) {
        applyDetail(refreshed);
      }

      setMessage(payload.message ?? "学生アプリメニュー設定を保存しました。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="cafPage">
      <PortalLoadingOverlay active={isBusy} />

      <header className="cafHeader">
        <div>
          <h2 className="cafTitle">学生アプリメニュー設定</h2>
          <p className="cafDescription">
            クラス単位で Orenda（学生アプリ）のホームメニュー表示と上からの並びを設定します。保存後、学生が再ログインすると反映されます。
          </p>
        </div>
      </header>

      {tableMissing ? (
        <p className="examScoreNotice">
          class_app_features のテーブル、または menu_order 列が未作成です。新規なら
          docs/sql/create-class-app-features.sql、既存テーブルなら
          docs/sql/add-class-app-features-menu-order.sql を Supabase で実行してください。
        </p>
      ) : null}

      <p className="cafHint">
        設定のクラス名は <code>students.class</code> と<strong>完全一致</strong>する必要があります（前後の空白に注意）。
        未保存のクラスは全機能 ON・既定順です。下部ナビの並びは変わりません。
      </p>

      {error ? <p className="loginError">{error}</p> : null}
      {message ? <p className="cafSuccess">{message}</p> : null}

      <div className="cafBody">
        <section className="cafClassPanel">
          <h3 className="cafSectionTitle">クラス一覧</h3>
          {classNames.length === 0 ? (
            <p className="learningTimeEmpty">表示できるクラスがありません。</p>
          ) : (
            <div className="cafClassList">
              {classNames.map((className) => {
                const item = items.find((row) => row.className === className);
                const isSelected = className === selectedClassName;
                const savedCount = item
                  ? countEnabledClassAppFeatures(item.features)
                  : CLASS_APP_FEATURE_KEYS.length;

                return (
                  <button
                    key={className}
                    type="button"
                    className={`cafClassRow${isSelected ? " cafClassRowSelected" : ""}`}
                    onClick={() => handleSelectClass(className)}
                  >
                    <span className="cafClassRowName">{className}</span>
                    <span className="cafClassRowMeta">
                      {item?.existsInDb ? `${savedCount}/6` : "未設定"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="cafEditPanel">
          {!selectedClassName ? (
            <div className="learningTimeEmptyPanel">クラスを選択してください。</div>
          ) : (
            <>
              <div className="cafEditHeader">
                <div>
                  <h3 className="cafSectionTitle">{selectedClassName}</h3>
                  <p className="cafEditMeta">
                    {existsInDb ? "DB保存済み" : "未保存（デフォルト全ON）"}
                    {" · "}
                    最終更新 {formatUpdatedAt(updatedAt)}
                    {selectedSummary?.updatedBy ? ` · ${selectedSummary.updatedBy}` : ""}
                  </p>
                </div>
                <div className="cafEditActions">
                  <button
                    type="button"
                    className="cafSecondaryBtn"
                    onClick={handleResetOrder}
                    disabled={isBusy}
                  >
                    既定順
                  </button>
                  <button
                    type="button"
                    className="cafSecondaryBtn"
                    onClick={handleEnableAll}
                    disabled={isBusy}
                  >
                    すべてON
                  </button>
                  <button
                    type="button"
                    className="cafSecondaryBtn"
                    onClick={handleDisableAll}
                    disabled={isBusy}
                  >
                    すべてOFF
                  </button>
                  <button
                    type="button"
                    className="cafPrimaryBtn"
                    onClick={() => void handleSave()}
                    disabled={isBusy || tableMissing}
                  >
                    保存
                  </button>
                </div>
              </div>

              <p className="cafEnabledCount">
                表示中: {enabledCount} / 6　上からこの順でホームメニューに出ます。行をドラッグするか、上下ボタンで並べ替えてください。
              </p>

              <div className="cafFeatureList">
                {menuOrder.map((key, index) => {
                  const definition = getClassAppFeatureDefinition(key);
                  if (!definition) {
                    return null;
                  }

                  return (
                    <div
                      key={key}
                      className={`cafFeatureRow${dragKey === key ? " cafFeatureRowDragging" : ""}`}
                      draggable={!isBusy && !tableMissing}
                      onDragStart={() => setDragKey(key)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => handleDrop(key)}
                      onDragEnd={() => setDragKey(null)}
                    >
                      <span className="cafFeatureOrder">{index + 1}</span>
                      <span className="cafFeatureText">
                        <span className="cafFeatureLabel">{definition.label}</span>
                        <span className="cafFeatureDescription">{definition.description}</span>
                      </span>
                      <span className="cafFeatureOrderActions">
                        <button
                          type="button"
                          className="cafOrderBtn"
                          aria-label={`${definition.label}を上へ`}
                          onClick={() => handleMove(key, -1)}
                          disabled={isBusy || tableMissing || index === 0}
                        >
                          上
                        </button>
                        <button
                          type="button"
                          className="cafOrderBtn"
                          aria-label={`${definition.label}を下へ`}
                          onClick={() => handleMove(key, 1)}
                          disabled={
                            isBusy || tableMissing || index === menuOrder.length - 1
                          }
                        >
                          下
                        </button>
                      </span>
                      <label className="nesActiveToggle">
                        <input
                          type="checkbox"
                          checked={features[key]}
                          onChange={(event) => handleToggle(key, event.target.checked)}
                          disabled={isBusy || tableMissing}
                        />
                        {features[key] ? "ON" : "OFF"}
                      </label>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
