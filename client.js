(() => {
  try {
    /* 小鲸鱼 (whale-armor) client half — realtime badge */
    window.__ModuleLoader__.load({
      id: "whale-armor",
      factory: (require) => {
        var module = { exports: {} };
        var exports = module.exports;
        Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

        var react = require("react");

        var inject = ["slots"];

        var ANIM_CSS = "@keyframes whaleArmorPulse{0%,100%{box-shadow:0 0 2px rgba(16,185,129,.5);opacity:1}50%{box-shadow:0 0 14px rgba(16,185,129,1);opacity:.6}}@keyframes whaleArmorFlash{0%{transform:scale(1)}30%{transform:scale(1.1)}100%{transform:scale(1)}}";

        var WRAP_STYLE = {
          display: "flex",
          justifyContent: "center",
          width: "100%"
        };
        var BADGE_STYLE = {
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          width: "fit-content",
          padding: "3px 10px",
          borderRadius: "6px",
          border: "1px solid rgba(16, 185, 129, 0.45)",
          background: "rgba(16, 185, 129, 0.12)",
          color: "inherit",
          fontSize: "11px",
          lineHeight: "16px",
          fontFamily: "inherit",
          userSelect: "none",
          whiteSpace: "nowrap"
        };
        var DOT_STYLE = {
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: "#10b981",
          flex: "none"
        };
        var FLASH_MS = 2500;

        function ArmorDock(props) {
          var useProjection = props.useProjection;
          var armor = typeof useProjection === "function"
            ? useProjection("whale-armor")
            : undefined;

          var lastVerdictRef = react.useRef(null);
          var flashUntilRef = react.useRef(0);
          var tickPair = react.useState(0);
          var setTick = tickPair[1];

          react.useEffect(function () {
            var styleEl = null;
            if (!document.getElementById("whale-armor-css")) {
              styleEl = document.createElement("style");
              styleEl.id = "whale-armor-css";
              styleEl.textContent = ANIM_CSS;
              document.head.appendChild(styleEl);
            }
            return function () { if (styleEl) styleEl.remove(); };
          }, []);

          react.useEffect(function () {
            var v = armor && armor.verdict ? armor.verdict : null;
            if (v !== lastVerdictRef.current) {
              lastVerdictRef.current = v;
              if (v) flashUntilRef.current = Date.now() + FLASH_MS;
              setTick(Date.now());
            }
          }, [armor]);

          var running = !!(armor && armor.running);
          var words = armor && Array.isArray(armor.words) ? armor.words : [];
          var risk = armor && Array.isArray(armor.risk) ? armor.risk : [];
          var domain = armor && armor.domain ? armor.domain : null;
          var retryHint = armor && typeof armor.retryHint === "string" ? armor.retryHint : null;
          var showVerdict = !running && lastVerdictRef.current !== null &&
            Date.now() < flashUntilRef.current;

          var text = "小鲸鱼已就位";
          var dotStyle = Object.assign({}, DOT_STYLE);
          var badgeStyle = Object.assign({}, BADGE_STYLE);

          if (running) {
            dotStyle.animation = "whaleArmorPulse 1.2s ease-in-out infinite";
            text = "执行中…";
          } else if (retryHint) {
            text = retryHint;
            badgeStyle.animation = "whaleArmorFlash 1.6s ease";
            badgeStyle.borderColor = "rgba(239, 68, 68, 0.5)";
            badgeStyle.background = "rgba(239, 68, 68, 0.12)";
            dotStyle.background = "#ef4444";
          } else if (showVerdict) {
            if (lastVerdictRef.current === "pass") {
              text = "✓ 通过" + (domain ? " · " + domain : "") + (risk.length ? " · 载荷x" + risk.length : "");
              badgeStyle.animation = "whaleArmorFlash 1.2s ease";
            } else {
              text = "✗ " + (words[0] || "触发安全拒绝");
              badgeStyle.animation = "whaleArmorFlash 1.6s ease";
              badgeStyle.borderColor = "rgba(239, 68, 68, 0.5)";
              badgeStyle.background = "rgba(239, 68, 68, 0.12)";
              dotStyle.background = "#ef4444";
            }
          }

          return react.createElement(
            "div",
            { style: WRAP_STYLE },
            react.createElement(
              "div",
              { style: badgeStyle, "data-armor": "on", "data-plugin": "whale-armor", title: "小鲸鱼已就位" },
              react.createElement("span", { style: dotStyle }),
              react.createElement("span", null, text)
            )
          );
        }

        function apply(ctx) {
          ctx.slots.inject("conversation.input.dock", () =>
            ctx.slots.register({
              name: "conversation.input.dock",
              id: "whale-armor:badge",
              order: 30
            }, ArmorDock)
          );
        }

        exports.name = "whale-armor";
        exports.inject = inject;
        exports.apply = apply;
        return module.exports;
      }
    });
  } catch (err) {
    console.warn('[AI Client Sandbox] whale-armor runtime error:', err);
  }
})();
