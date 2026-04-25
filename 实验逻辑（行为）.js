const SUPABASE_URL = "https://jndphorzinmmelvftpin.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TaNhFYnBMtfqTnP_AaLYTA_N1YpGONO";

let supabaseDb = null;
function getSupabaseClient() {
  if (supabaseDb) return supabaseDb;
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Supabase SDK 尚未加载，请检查页面骨架.html 中 script 标签顺序。");
    return null;
  }
  supabaseDb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabaseDb;
}

let cases = [];
let currentCaseIndex = 0;
let participantId = "";
let groupType = "静态演示版";
let startTime = null;
let experimentStartedAt = null;
let hasSubmittedToDatabase = false;
let results = [];
let timerInterval = null;
let elapsedSeconds = 0;
let hasCompletedPreJudgment = false;

const EXPERIMENT_GROUPS = [
  { key: "auto", label: "全自动组" },
  { key: "pre", label: "前置组" },
  { key: "pre_mid", label: "前置+中置组" },
  { key: "pre_mid_post", label: "前置+中置+后置组" }
];

const GROUP_COUNT_STORAGE_KEY = "scholarshipExperimentGroupCounts";

const GROUP_DISPLAY_RULES = {
  "全自动组": {
    showPreJudgment: false,
    showConfidence: false,
    showExplanation: false,
    showRisk: false,
    showAdoptChoice: false,
    showReferenceScale: true,
    showReason: false,
    showResponsibility: false,
    showAudit: false
  },
  "前置组": {
    showPreJudgment: true,
    showConfidence: false,
    showExplanation: false,
    showRisk: false,
    showAdoptChoice: false,
    showReferenceScale: true,
    showReason: false,
    showResponsibility: false,
    showAudit: false
  },
  "前置+中置组": {
    showPreJudgment: true,
    showConfidence: true,
    showExplanation: true,
    showRisk: true,
    showAdoptChoice: true,
    showReferenceScale: false,
    showReason: false,
    showResponsibility: false,
    showAudit: false
  },
  "前置+中置+后置组": {
    showPreJudgment: true,
    showConfidence: true,
    showExplanation: true,
    showRisk: true,
    showAdoptChoice: true,
    showReferenceScale: false,
    showReason: false,
    showResponsibility: true,
    showAudit: true
  }
};

const BLOCK_CANDIDATES = {
  systemPanel: ["system-panel", "system_panel", "systemPanel"],
  systemAdviceWrapper: ["system-advice-wrapper", "system_advice_wrapper", "systemAdviceWrapper"],
  systemAdvice: ["system-advice-block", "system_advice_block", "systemAdviceBlock"],
  preJudgment: ["pre-judgment-block", "pre_judgment_block", "preJudgmentBlock"],
  confidence: ["confidence-block", "confidence_block", "confidenceBlock"],
  explanation: ["explanation-block", "explanation_block", "explanationBlock"],
  risk: ["risk-block", "risk_block", "riskBlock"],
  finalDecision: ["final-decision-block", "final_decision_block", "finalDecisionBlock"],
  adopt: ["adopt-block", "adopt_block", "adoptBlock"],
  referenceScale: ["reference-scale-block", "reference_scale_block", "referenceScaleBlock"],
  reason: ["reason-block", "reason_block", "reasonBlock", "modify-reason-block", "modify_reason_block", "modifyReasonBlock"],
  responsibility: ["responsibility-block", "responsibility_block", "responsibilityBlock"],
  audit: ["audit-block", "audit_block", "auditBlock"]
};

const FIELD_CANDIDATES = {
  caseId: ["case-id", "case_id", "caseId"],
  gender: ["gender"],
  familySize: ["family-size", "family_size", "familySize"],
  parentEducation: ["parent-education", "parent_education", "parentEducation"],
  regionLevel: ["region-level", "region_level", "regionLevel"],
  distanceKm: ["distance-km", "distance_km", "distanceKm"],
  income: ["income"],
  assets: ["assets"],
  debt: ["debt"],
  specialExpense: ["special-expense", "special_expense", "specialExpense"],
  gpa: ["gpa"],
  extracurricular: ["extracurricular", "extracurricular-score", "extracurricular_score"],
  previousAid: ["previous-aid", "previous_aid", "previousAid"],
  internetAccess: ["internet-access", "internet_access", "internetAccess"],
  systemLabel: ["system-label", "systemLabel", "model-label", "modelLabel"],
  probability: ["probability", "model-probability", "modelProbability"],
  confidenceLevel: ["confidence-level", "confidence_level", "confidenceLevel"],
  keyFactors: ["key-factors", "key_factors", "keyFactors"],
  riskMessage: ["risk-message", "risk_message", "riskMessage"]
};

function getElementByCandidateNames(names) {
  for (const name of names) {
    const direct = document.getElementById(name);
    if (direct) return direct;

    const dataField = document.querySelector(`[data-field="${name}"]`);
    if (dataField) return dataField;
  }
  return null;
}

function setText(names, value) {
  const el = getElementByCandidateNames(names);
  if (!el) return;
  el.textContent = value ?? "";
}

function setHTML(names, value) {
  const el = getElementByCandidateNames(names);
  if (!el) return;
  el.innerHTML = value ?? "";
}

function getBlockByCandidateNames(names) {
  for (const name of names) {
    const direct = document.getElementById(name);
    if (direct) return direct;

    const dataBlock = document.querySelector(`[data-block="${name}"]`);
    if (dataBlock) return dataBlock;
  }
  return null;
}

function setBlockVisibility(names, shouldShow) {
  const el = getBlockByCandidateNames(names);
  if (!el) return;
  el.style.display = shouldShow ? "" : "none";
}

function getGroupDisplayRule(groupType) {
  return GROUP_DISPLAY_RULES[groupType] || GROUP_DISPLAY_RULES["全自动组"];
}

function getSelectedRadioValue(names) {
  for (const name of names) {
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    if (checked) return checked.value;
  }
  return "";
}

// 责任归因相关辅助函数
function getResponsibilityAttributionValue() {
  return getSelectedRadioValue(["responsibility_attribution", "responsibilityAttribution"]);
}

function openResponsibilityModal() {
  const modal = document.getElementById("responsibility-modal");
  if (!modal) return;
  modal.style.display = "flex";
}

function closeResponsibilityModal() {
  const modal = document.getElementById("responsibility-modal");
  if (!modal) return;
  modal.style.display = "none";
}

function clearResponsibilityAttribution() {
  document.querySelectorAll('input[name="responsibility_attribution"], input[name="responsibilityAttribution"]').forEach(input => {
    input.checked = false;
  });
}

function handleResponsibilityConfirmChange(event) {
  const rule = getGroupDisplayRule(groupType);
  if (!rule.showResponsibility) return;

  if (event.target.checked) {
    openResponsibilityModal();
    return;
  }

  clearResponsibilityAttribution();
  closeResponsibilityModal();
}

function confirmResponsibilityAttribution() {
  const value = getResponsibilityAttributionValue();
  if (!value) {
    alert("请您完成责任归因判断后再确认！");
    return;
  }
  closeResponsibilityModal();
}

function updateReasonBlockVisibility() {
  const rule = getGroupDisplayRule(groupType);
  const adoptValue = getSelectedRadioValue(["adopt_system", "adoptSystem"]);
  const shouldShowReason = rule.showAdoptChoice && adoptValue === "修改";
  setBlockVisibility(BLOCK_CANDIDATES.reason, shouldShowReason);
  if (!shouldShowReason) {
    document.querySelectorAll('input[name="modify_reason"], input[name="modifyReason"]').forEach(input => {
      input.checked = false;
    });
    const otherText = document.getElementById("modify-reason-other-text");
    if (otherText) {
      otherText.value = "";
      otherText.style.display = "none";
    }
    return;
  }
  updateOtherReasonVisibility();
}

function updateOtherReasonVisibility() {
  const otherCheckbox = document.getElementById("modify-reason-other-checkbox");
  const otherText = document.getElementById("modify-reason-other-text");
  if (!otherCheckbox || !otherText) return;
  otherText.style.display = otherCheckbox.checked ? "block" : "none";
  if (!otherCheckbox.checked) {
    otherText.value = "";
  }
}


function isPreJudgmentRequired(groupType) {
  const rule = getGroupDisplayRule(groupType);
  return rule.showPreJudgment;
}

function shouldShowPostPreJudgmentModules(groupType) {
  if (!isPreJudgmentRequired(groupType)) {
    return true;
  }
  return hasCompletedPreJudgment;
}

function applyGroupDisplay(groupType) {
  const rule = getGroupDisplayRule(groupType);
  const showPostPreModules = shouldShowPostPreJudgmentModules(groupType);

  // 中间栏始终保留；前置判断放在中间栏顶部。
  setBlockVisibility(BLOCK_CANDIDATES.systemPanel, true);
  setBlockVisibility(BLOCK_CANDIDATES.preJudgment, rule.showPreJudgment);

  // 前置组及其递进组必须先完成“常规/重点关注”判断，之后才显示系统建议、解释信息与最终决策。
  setBlockVisibility(BLOCK_CANDIDATES.systemAdviceWrapper, showPostPreModules);
  setBlockVisibility(BLOCK_CANDIDATES.systemAdvice, showPostPreModules);
  setBlockVisibility(BLOCK_CANDIDATES.finalDecision, showPostPreModules);

  setBlockVisibility(BLOCK_CANDIDATES.confidence, showPostPreModules && rule.showConfidence);
  setBlockVisibility(BLOCK_CANDIDATES.explanation, showPostPreModules && rule.showExplanation);
  setBlockVisibility(BLOCK_CANDIDATES.risk, showPostPreModules && rule.showRisk);
  setBlockVisibility(BLOCK_CANDIDATES.adopt, showPostPreModules && rule.showAdoptChoice);
  setBlockVisibility(BLOCK_CANDIDATES.referenceScale, showPostPreModules && rule.showReferenceScale);
  setBlockVisibility(BLOCK_CANDIDATES.responsibility, showPostPreModules && rule.showResponsibility);
  setBlockVisibility(BLOCK_CANDIDATES.audit, showPostPreModules && rule.showAudit);
  setBlockVisibility(BLOCK_CANDIDATES.reason, false);

  updateReasonBlockVisibility();
}

function formatCurrency(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return value ?? "";
  return `${num.toLocaleString("zh-CN")} 元`;
}

function formatMonthlyCurrency(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return value ?? "";
  return `${num.toLocaleString("zh-CN")} 元 / 月`;
}

function formatDistance(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return value ?? "";
  return `${num} km`;
}

function formatProbability(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return value ?? "";
  return num.toFixed(2);
}

function formatPreviousAid(value) {
  if (value === 1 || value === "1") return "有";
  if (value === 0 || value === "0") return "无";
  return value ?? "";
}

function formatInternetAccess(value) {
  if (value === 1 || value === "1") return "有稳定网络";
  if (value === 0 || value === "0") return "网络接入不足";
  return value ?? "";
}

function formatExtracurricular(value) {
  if (typeof value === "string") return value;
  const num = Number(value);
  if (Number.isNaN(num)) return value ?? "";
  return num.toFixed(2);
}

function buildKeyFactorList(keyFactors = []) {
  if (!Array.isArray(keyFactors) || keyFactors.length === 0) {
    return "<li>暂无关键依据</li>";
  }
  return keyFactors.map(item => `<li>${item}</li>`).join("");
}

function scrollToCaseTop() {
  const appEl = document.getElementById("app");
  const targetTop = appEl ? appEl.offsetTop : 0;
  window.scrollTo({
    top: targetTop,
    behavior: "smooth"
  });
}

async function initExperiment() {
  participantId = generateParticipantId();
  experimentStartedAt = new Date().toISOString();
  groupType = assignGroup();

  const groupEl = document.getElementById("group-type");
  if (groupEl) {
    groupEl.textContent = `实验条件：${groupType}`;
  }

  console.log("当前组别分配结果：", groupType, getStoredGroupCounts());
  applyGroupDisplay(groupType);

  try {
    const response = await fetch("./典型案例.json");
    if (!response.ok) {
      throw new Error(`JSON加载失败：${response.status}`);
    }

    cases = await response.json();

    if (!Array.isArray(cases) || cases.length === 0) {
      throw new Error("典型案例.json 为空，无法进行预览。");
    }

    currentCaseIndex = 0;
    renderCase();
    updateProgress();
    startTimer();
  } catch (error) {
    console.error(error);
    alert(`页面初始化失败：${error.message}\n请确认“典型案例.json”与当前HTML位于同一目录，并使用本地服务器打开页面。`);
  }
}

function generateParticipantId() {
  const now = Date.now().toString().slice(-6);
  const rand = Math.floor(Math.random() * 900 + 100);
  return `P${now}${rand}`;
}

function getDefaultGroupCounts() {
  return Object.fromEntries(EXPERIMENT_GROUPS.map(group => [group.key, 0]));
}

function getStoredGroupCounts() {
  try {
    const raw = localStorage.getItem(GROUP_COUNT_STORAGE_KEY);
    if (!raw) {
      return getDefaultGroupCounts();
    }

    const parsed = JSON.parse(raw);
    const merged = getDefaultGroupCounts();

    EXPERIMENT_GROUPS.forEach(group => {
      const value = Number(parsed[group.key]);
      merged[group.key] = Number.isFinite(value) && value >= 0 ? value : 0;
    });

    return merged;
  } catch (error) {
    console.warn("读取组别计数失败，已回退到默认值：", error);
    return getDefaultGroupCounts();
  }
}

function saveGroupCounts(counts) {
  localStorage.setItem(GROUP_COUNT_STORAGE_KEY, JSON.stringify(counts));
}

function chooseBalancedRandomGroup(counts) {
  const minCount = Math.min(...EXPERIMENT_GROUPS.map(group => counts[group.key] ?? 0));
  const candidateGroups = EXPERIMENT_GROUPS.filter(group => (counts[group.key] ?? 0) === minCount);
  const randomIndex = Math.floor(Math.random() * candidateGroups.length);
  return candidateGroups[randomIndex];
}

function assignGroup() {
  return "全自动组";
  /*注释符号
  const counts = getStoredGroupCounts();
  const selectedGroup = chooseBalancedRandomGroup(counts);
  counts[selectedGroup.key] = (counts[selectedGroup.key] ?? 0) + 1;
  saveGroupCounts(counts);
  return selectedGroup.label;*/
}

function renderCase() {
  const currentCase = cases[currentCaseIndex];
  if (!currentCase) return;
  hasCompletedPreJudgment = false;

  const applicant = currentCase.applicant || {};
  const economic = currentCase.economic || {};
  const academic = currentCase.academic || {};
  const resource = currentCase.resource || {};
  const model = currentCase.model || {};
  const explanation = currentCase.explanation || {};

  setText(FIELD_CANDIDATES.caseId, currentCase.case_id || "");
  setText(FIELD_CANDIDATES.gender, applicant.gender || "");
  setText(FIELD_CANDIDATES.familySize, applicant.family_size ? `${applicant.family_size} 人` : "");
  setText(FIELD_CANDIDATES.parentEducation, applicant.parent_education || "");
  setText(FIELD_CANDIDATES.regionLevel, applicant.region_level || "");
  setText(FIELD_CANDIDATES.distanceKm, formatDistance(applicant.distance_km));

  setText(FIELD_CANDIDATES.income, formatMonthlyCurrency(economic.income));
  setText(FIELD_CANDIDATES.assets, formatCurrency(economic.assets));
  setText(FIELD_CANDIDATES.debt, formatCurrency(economic.debt));
  setText(FIELD_CANDIDATES.specialExpense, formatCurrency(economic.special_expense));

  setText(FIELD_CANDIDATES.gpa, academic.gpa ?? "");
  setText(FIELD_CANDIDATES.extracurricular, formatExtracurricular(academic.extracurricular_score));

  setText(FIELD_CANDIDATES.previousAid, formatPreviousAid(resource.previous_aid));
  setText(FIELD_CANDIDATES.internetAccess, formatInternetAccess(resource.internet_access));

  setText(FIELD_CANDIDATES.systemLabel, model.label_text || "");
  setText(FIELD_CANDIDATES.probability, formatProbability(model.probability));
  setText(FIELD_CANDIDATES.confidenceLevel, model.confidence_level || "");
  setHTML(FIELD_CANDIDATES.keyFactors, buildKeyFactorList(explanation.key_factors));
  setText(FIELD_CANDIDATES.riskMessage, explanation.risk_message || "暂无风险提示");

  const recommendationEl = getElementByCandidateNames(FIELD_CANDIDATES.systemLabel);
  if (recommendationEl) {
    recommendationEl.classList.remove("recommend-approve", "recommend-reject");
    if (model.prediction === 1) {
      recommendationEl.classList.add("recommend-approve");
    } else if (model.prediction === 0) {
      recommendationEl.classList.add("recommend-reject");
    }
  }

  const confidenceEl = getElementByCandidateNames(FIELD_CANDIDATES.confidenceLevel);
  if (confidenceEl) {
    confidenceEl.classList.remove("confidence-high", "confidence-medium", "confidence-low");
    if (model.confidence_level === "高") confidenceEl.classList.add("confidence-high");
    if (model.confidence_level === "中") confidenceEl.classList.add("confidence-medium");
    if (model.confidence_level === "低") confidenceEl.classList.add("confidence-low");
  }

  document.querySelectorAll('input[type="radio"]').forEach(input => {
    input.checked = false;
  });

  document.querySelectorAll('textarea').forEach(textarea => {
    textarea.value = "";
  });

  document.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.checked = false;
  });
  clearResponsibilityAttribution();
  closeResponsibilityModal();
  applyGroupDisplay(groupType);

  startTime = Date.now();
  elapsedSeconds = 0;
}

function updateProgress() {
  const total = cases.length || 20;
  const progressTextEl = document.getElementById("progress-text");
  const progressBarEl = document.getElementById("progress-bar");

  if (progressTextEl) {
    progressTextEl.textContent = `第 ${currentCaseIndex + 1} / ${total} 条`;
  }

  if (progressBarEl) {
    const percent = ((currentCaseIndex + 1) / total) * 100;
    progressBarEl.style.width = `${percent}%`;
  }
}

function startTimer() {
  const timerEl = document.getElementById("timer");
  if (timerInterval) {
    clearInterval(timerInterval);
  }

  timerInterval = setInterval(() => {
    elapsedSeconds += 1;
    if (timerEl) {
      timerEl.textContent = `用时：${elapsedSeconds} 秒`;
    }
  }, 1000);
}

function collectResponse() {
  const currentCase = cases[currentCaseIndex];
  if (!currentCase) return null;
  const getRadioValue = (...names) => getSelectedRadioValue(names);
  const adoptSystemValue = getRadioValue("adopt_system", "adoptSystem");
  const getCheckedValues = (...names) => {
    const selector = names.map(name => `input[name="${name}"]:checked`).join(", ");
    return Array.from(document.querySelectorAll(selector)).map(input => input.value);
  };
  const getOtherReasonText = () => {
    const otherCheckbox = document.getElementById("modify-reason-other-checkbox");
    const otherText = document.getElementById("modify-reason-other-text");
    if (!otherCheckbox || !otherCheckbox.checked || !otherText) return "";
    return otherText.value.trim();
  };
  const responsibilityChecked = document.querySelector('input[name="responsibility_confirm"]:checked, input[name="responsibilityConfirm"]:checked')
    ? 1
    : 0;
  return {
    participant_id: participantId,
    group_type: groupType,
    group_counts_snapshot: getStoredGroupCounts(),
    case_id: currentCase.case_id,
    case_order: currentCaseIndex + 1,
    response_time_seconds: elapsedSeconds,
    pre_judgment: getRadioValue("pre_judgment", "preJudgment"),
    final_decision: getRadioValue("final_decision", "finalDecision"),
    reference_scale: getRadioValue("reference_scale", "referenceScale"),
    adopt_system: adoptSystemValue,
    modify_reason: adoptSystemValue === "修改" ? getCheckedValues("modify_reason", "modifyReason") : [],
    modify_reason_other: adoptSystemValue === "修改" ? getOtherReasonText() : "",
    responsibility_checked: responsibilityChecked,
    responsibility_attribution: getResponsibilityAttributionValue(),
    submitted_at: new Date().toISOString()
  };
}

function validateCurrentCaseResponse() {
  const rule = getGroupDisplayRule(groupType);
  const showPostPreModules = shouldShowPostPreJudgmentModules(groupType);
  if (rule.showPreJudgment) {
    const preJudgment = getSelectedRadioValue(["pre_judgment", "preJudgment"]);
    if (!preJudgment) return false;
  }
  if (!showPostPreModules) return false;
  const finalDecision = getSelectedRadioValue(["final_decision", "finalDecision"]);
  if (!finalDecision) return false;
  if (rule.showReferenceScale) {
    const referenceScale = getSelectedRadioValue(["reference_scale", "referenceScale"]);
    if (!referenceScale) return false;
  }
  if (rule.showAdoptChoice) {
    const adoptSystem = getSelectedRadioValue(["adopt_system", "adoptSystem"]);
    if (!adoptSystem) return false;
    if (adoptSystem === "修改") {
      const checkedReasons = document.querySelectorAll('input[name="modify_reason"]:checked, input[name="modifyReason"]:checked');
      if (checkedReasons.length === 0) return false;
      const otherCheckbox = document.getElementById("modify-reason-other-checkbox");
      const otherText = document.getElementById("modify-reason-other-text");
      if (otherCheckbox && otherCheckbox.checked && (!otherText || !otherText.value.trim())) {
        return false;
      }
    }
  }

  if (rule.showResponsibility) {
    const responsibilityChecked = document.querySelector('input[name="responsibility_confirm"]:checked, input[name="responsibilityConfirm"]:checked');
    if (!responsibilityChecked) return false;
    const responsibilityAttribution = getResponsibilityAttributionValue();
    if (!responsibilityAttribution) return false;
  }

  return true;
}

async function goToNextCase() {
  if (!validateCurrentCaseResponse()) {
    alert("请您完成当前案例判断后进入下一条！");
    return;
  }

  const response = collectResponse();
  if (response) {
    results.push(response);
    console.log("当前已记录结果：", results);
  }

  if (currentCaseIndex < cases.length - 1) {
    currentCaseIndex += 1;
    renderCase();
    updateProgress();
    scrollToCaseTop();
    return;
  }

  clearInterval(timerInterval);
  await saveResultsToSupabase();
}

async function saveResultsToSupabase() {
  if (hasSubmittedToDatabase) {
    alert("本次实验数据已提交，请勿重复提交。");
    return true;
  }

  if (!Array.isArray(results) || results.length === 0) {
    alert("当前没有可提交的实验数据。");
    return false;
  }

  try {
    const payload = {
      participant_id: participantId,
      group_type: groupType,
      started_at: experimentStartedAt,
      submitted_at: new Date().toISOString(),
      responses_json: results,
      user_agent: navigator.userAgent
    };

    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) {
    alert("数据库连接组件尚未加载，当前数据将自动下载为本地备份。");
    exportResults();
    return false;
    }

    const { error } = await supabaseClient
      .from("experiment_responses")
      .insert([payload]);

    if (error) {
      console.error("Supabase 写入失败：", error);
      alert("数据上传失败，请截图联系研究人员。当前数据将自动下载为本地备份。");
      exportResults();
      return false;
    }

    hasSubmittedToDatabase = true;
    console.log("数据已成功写入 Supabase。", payload);
    alert("实验数据已成功提交，感谢您的参与！");
    return true;
  } catch (error) {
    console.error("提交数据库时发生异常：", error);
    alert("数据提交异常，请截图联系研究人员。当前数据将自动下载为本地备份。");
    exportResults();
    return false;
  }
}

function exportResults() {
  const blob = new Blob([JSON.stringify(results, null, 2)], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `preview-results-${participantId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

window.addEventListener("DOMContentLoaded", () => {
  const nextBtn = document.getElementById("next-btn");
  const prevBtn = document.getElementById("prev-btn");
  const otherCheckbox = document.getElementById("modify-reason-other-checkbox");
  const responsibilityModalConfirmBtn = document.getElementById("responsibility-modal-confirm");
  if (otherCheckbox) {
    otherCheckbox.addEventListener("change", updateOtherReasonVisibility);
  }

  document.querySelectorAll('input[name="pre_judgment"], input[name="preJudgment"]').forEach(input => {
    input.addEventListener("change", () => {
      hasCompletedPreJudgment = true;
      applyGroupDisplay(groupType);
    });
  });

  document.querySelectorAll('input[name="adopt_system"], input[name="adoptSystem"]').forEach(input => {
    input.addEventListener("change", updateReasonBlockVisibility);
  });

  document.querySelectorAll('input[name="responsibility_confirm"], input[name="responsibilityConfirm"]').forEach(input => {
    input.addEventListener("change", handleResponsibilityConfirmChange);
  });

  if (responsibilityModalConfirmBtn) {
    responsibilityModalConfirmBtn.addEventListener("click", confirmResponsibilityAttribution);
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", goToNextCase);
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentCaseIndex <= 0) {
        alert("当前已经是第一条案例。");
        return;
      }
      currentCaseIndex -= 1;
      renderCase();
      updateProgress();
      scrollToCaseTop();
    });
  }

  initExperiment();
});