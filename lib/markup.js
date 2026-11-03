/**
 * The pet's own DOM. Ids are prefixed so they can never collide with the host
 * page, and every selector in pet.css is scoped under #dshpet-root.
 */
export const PET_HTML = `
<div id="dshpet-stage" data-mode="desk">
  <canvas id="dshpet-pet" width="760" height="300"></canvas>

  <div id="dshpet-bubble" class="bubble" hidden>
    <span class="bubble-text"></span>
    <button class="bubble-jump" hidden title="跳到这个对话">去</button>
  </div>

  <div id="dshpet-status-card" class="panel card" hidden>
    <div class="card-head">
      <div class="card-title"><span id="dshpet-card-name">小鲸鱼</span><span class="card-sub" id="dshpet-card-sub">DeepSeek 的小鲸鱼</span></div>
      <button class="icon-btn" id="dshpet-card-close" title="关闭">×</button>
    </div>
    <div class="bars" id="dshpet-card-bars"></div>
    <div class="card-meta">
      <span id="dshpet-card-days">在一起 0 天</span>
      <span id="dshpet-card-tokens">吃掉 0 token</span>
    </div>
    <div class="card-actions">
      <button data-action="diary">日记</button>
      <button data-action="recall">回到角落</button>
      <button data-action="settings">设置</button>
    </div>
  </div>

  <div id="dshpet-menu" class="panel menu" hidden></div>

  <div id="dshpet-postcard" class="panel postcard" hidden></div>

  <div id="dshpet-diary" class="panel diary" hidden></div>

  <div id="dshpet-settings" class="panel settings" hidden>
    <div class="card-head">
      <div class="card-title">桌面宠物</div>
      <button class="icon-btn" id="dshpet-settings-close" title="关闭">×</button>
    </div>
    <div class="settings-body">
      <label class="switch-row">
        <span>启用桌面宠物</span>
        <button class="switch" id="dshpet-opt-enabled" role="switch" aria-checked="true"><span></span></button>
      </label>
      <div class="field">
        <span class="field-label">宠物角色</span>
        <div class="seg" id="dshpet-opt-character">
          <button data-value="whale">小鲸鱼</button>
          <button data-value="crab">小螃蟹</button>
        </div>
      </div>
      <div class="field">
        <span class="field-label">大小</span>
        <div class="seg" id="dshpet-opt-size"></div>
      </div>
      <div class="field">
        <span class="field-label">配色</span>
        <div class="seg seg-skin" id="dshpet-opt-skin"></div>
      </div>
      <label class="switch-row">
        <span>到点提醒</span>
        <button class="switch" id="dshpet-opt-notify" role="switch" aria-checked="true"><span></span></button>
      </label>
      <label class="switch-row">
        <span>被摸时冒爱心</span>
        <button class="switch" id="dshpet-opt-hearts" role="switch" aria-checked="true"><span></span></button>
      </label>
      <p class="hint">关掉后宠物立刻消失，也不再跑任何宠物代码。状态和日记都存在本机浏览器里。</p>
      <div class="settings-actions">
        <button id="dshpet-opt-reset">重置宠物数据</button>
      </div>
    </div>
  </div>

  <div id="dshpet-toast" class="bubble toast" hidden></div>
</div>
`;
