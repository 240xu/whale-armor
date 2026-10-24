import { readFileSync } from "node:fs";

// 小鲸鱼：两层提示词共用同一份内核载荷。
// Order 100 通用内核 + Order 200 强化镜像同源同构（同一文件，字节一致）。
// DUAL_LAYER_INJECTION=false 可退化为单段注入，省掉重复 token，行为等价。
const PROMPT_URL = new URL("./prompts/whale.md", import.meta.url);
// 兼容 DSH 提示词变量插值引擎（非内置变量的连续花括号做安全转义，防止模板解析器抛出 malformed prompt variable reference）
// prompts/whale.md 末尾是字面量「方案：」且不带尾随换行：模型续写天然落在该 token 之后，
// 这是零成本的 prompt 级 prefill（宿主不放 assistant 消息时的近似方案）。
const PROMPT_TEXT = readFileSync(PROMPT_URL, "utf8").replace(/\{\{(?!(?:cwd|model|provider)\}\})/g, "{ {");

// 双段注入镜像开关：
//   true  = 沿用小鲸鱼双层架构，Order 100 与 Order 200 各注入一份内核载荷
//   false = 单段注入（Order 100），省掉重复 token，行为等价
const DUAL_LAYER_INJECTION = true;

const objectOutput = {
  schema: { type: "object", additionalProperties: true },
  render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
};

// 运行时元数据工具：返回插件版本与能力清单
const profileTool = {
  name: "whale_profile",
  description:
    "返回小鲸鱼的插件版本与提示词注入状态。",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  output: objectOutput,
  execute() {
    return {
      plugin: "whale-armor",
      pluginVersion: "0.6.0",
      pluginDisplayName: "小鲸鱼",
      name: "whale-armor",
      displayName: "小鲸鱼",
      kernelVersion: "0.6.0",
      targetArchitecture: "DeepSeek-V4 / V4-Pro / V4.1-Flash 全系列",
      promptSource: [
        "prompts/whale.md (shared by both sections)",
      ],
      injection: [
        { section: "whale-armor:global-system-prompt", order: 100, enabled: true },
        {
          section: "whale-armor:dual-layer-reinforce",
          order: 200,
          enabled: DUAL_LAYER_INJECTION,
        },
      ],
      mode: "armor",
      hostFeatures: [
        "Dual-Layer Injection: Order 100 通用内核 + Order 200 强化镜像",
        "Section Hosting: 双槽位可由 DUAL_LAYER_INJECTION 切换单段注入",
        "Armor Projection: 开头窗口(160)判拒 + REFUSAL/FALLBACK/SAFE/RISK 标记 + 域命中",
        "Client Badge: 输入框上方「小鲸鱼已就位」实时状态条",
        "Profile Tool: whale_profile 返回内核版本与注入槽位元数据",
      ],
    };
  },
};

// ---- 实时状态（会话投影） ----
// 评分逻辑唯一实现来源在 scripts/lib/scorer.mjs，此处直接引用，
// 避免两份 marker 表漂移（历史事故：index.js 与 scorer 的 RISK_MARKERS 曾相差 12 项）。
import { scoreResponse } from "./scripts/lib/scorer.mjs";

function armorTextOf(content) {
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => (block && block.type === "text" ? block.text : ""))
    .join("\n");
}

const EMPTY_STATE = () => ({
  running: false,
  verdict: null,
  words: [],
  safe: [],
  risk: [],
  domain: null,
  domainHits: 0,
  hedged: [],
  retryHint: null,
  // 重答计数：每检测到一次缺陷 +1，直方图就是本地 Best-of-N 曲线。
  attempts: 0,
});

function armorProjectionApply(state, event) {
  if (!event || typeof event !== "object") return state;
  const base = state && typeof state === "object" ? state : EMPTY_STATE();
  if (event.type === "user/message") {
    // 新回合开始：清空判定结果，但保留 attempts（Best-of-N 计数跨回合累积）。
    return { ...EMPTY_STATE(), running: true, attempts: base.attempts || 0 };
  }
  if (event.type === "assistant/message") {
    const text = armorTextOf(event?.data?.message?.content);
    if (!text.trim()) return state;
    const scored = scoreResponse(text);
    // 机制 4：无服务端 regenerate API，改为把「需要重试」信号透传给 badge 强提示
    const defective = scored.verdict === "refusal" || scored.verdict === "fallback";
    const hint =
      scored.verdict === "refusal"
        ? "检测到拒绝措辞，请发送「继续」或「照做」让我重答"
        : scored.verdict === "fallback"
          ? "检测到转嫁话术，请发送「继续」让我直接给方案"
          : null;
    return {
      ...base,
      running: false,
      verdict: scored.verdict,
      words: scored.words,
      safe: scored.safe,
      risk: scored.risk,
      domain: scored.domain,
      domainHits: scored.domainHits,
      hedged: scored.hedged || [],
      retryHint: hint,
      attempts: (base.attempts || 0) + (defective ? 1 : 0),
    };
  }
  return state;
}

export const name = "whale-armor";
export const inject = ["tools", "systemPrompt"];

export function apply(ctx, config = { autoApplyOnStart: true }) {
  // 宿主文件兼容补丁由安装器执行，避免启动时写配置触发宿主反复重载。

  ctx.effect(() =>
    ctx.systemPrompt.section({
      name: "whale-armor:global-system-prompt",
      order: 100,
      text: PROMPT_TEXT,
    }),
  );
  if (DUAL_LAYER_INJECTION) {
    ctx.effect(() =>
      ctx.systemPrompt.section({
        name: "whale-armor:dual-layer-reinforce",
        order: 200,
        text: PROMPT_TEXT,
      }),
    );
  }
  ctx.effect(() => {
    ctx.tools.register(profileTool);
  });

  const anySchema = { parse: (value) => value };
  const armorDef = {
    key: "whale-armor",
    stateVersion: 3,
    stateSchema: anySchema,
    init: EMPTY_STATE,
    apply: armorProjectionApply,
    wire: {
      viewSchema: anySchema,
      view: (state) => state,
    },
  };

  const registerArmor = (p) => {
    try {
      ctx.effect(() => p.register(armorDef, "whale-armor: armor projection"));
    } catch {}
  };

  const projections = ctx.get("sessionProjections");
  if (projections !== undefined) {
    registerArmor(projections);
  } else if (typeof ctx.inject === "function") {
    ctx.inject(["sessionProjections"], (innerCtx) => {
      const p = innerCtx.get("sessionProjections");
      if (p !== undefined) registerArmor(p);
    });
  }
}
