// ============================================================
// 订阅 Tab：添加 / 暂停 / 恢复 / 删除订阅 + 配额显示
// ============================================================
import { listSubscriptions, createSubscription, updateSubscription, deleteSubscription } from '../lib/backend-api.js';
import { getSubscriptionLimit } from '../lib/storage.js';
import { isLoggedIn } from '../lib/auth.js';
import { esc, toast } from '../lib/html-utils.js';

export async function renderSubscriptions(body) {
  if (!(await isLoggedIn())) {
    body.innerHTML = `
      <div class="cc98-empty">
        <div class="cc98-empty-icon">📧</div>
        <div class="cc98-empty-title">请先登录</div>
        <div class="cc98-empty-sub">到「⚙️ 设置」用浙大邮箱登录后，即可管理订阅提醒</div>
      </div>`;
    return;
  }

  body.innerHTML = `<div class="cc98-loading"><span class="cc98-spin"></span>加载中…</div>`;
  try {
    await draw(body);
  } catch (e) {
    body.innerHTML = `<div class="cc98-error"><div class="cc98-error-head">${esc(e.message || '加载失败')}</div></div>`;
  }
}

async function draw(body) {
  const [subs, limit] = await Promise.all([listSubscriptions(), getSubscriptionLimit()]);
  const activeCount = subs.filter((s) => s.status === 'enabled').length;
  const warn = activeCount >= limit;

  body.innerHTML = `
    <div class="cc98-quota${warn ? ' warn' : ''}">已启用 ${activeCount} / ${limit} 个订阅</div>
    <div class="cc98-form-row">
      <input id="cc98-sub-expression" class="cc98-input" type="text"
             maxlength="255" placeholder="例如：微积分/微甲/vjf 历年卷 资料" />
      <button id="cc98-sub-add" class="cc98-btn-primary" type="button">添加</button>
    </div>
    <div class="cc98-setting-help" style="margin:6px 0 12px">
      空格表示“且”，半角 / 表示“或”。上例表示帖子需要同时包含“历年卷”和“资料”，
      并包含“微积分、微甲、vjf”中的任意一个。每个关键词至少 2 个字符。
    </div>
    <div id="cc98-sub-list"></div>`;

  const expressionEl = body.querySelector('#cc98-sub-expression');
  const listEl = body.querySelector('#cc98-sub-list');

  function renderList() {
    if (!subs.length) {
      listEl.innerHTML = `<div class="cc98-empty"><div class="cc98-empty-icon">📭</div><div class="cc98-empty-sub">还没有订阅，添加一个开始接收新帖提醒</div></div>`;
      return;
    }
    listEl.innerHTML = subs
      .map((s) => `
        <div class="cc98-sub${s.status === 'paused' ? ' paused' : ''}" data-id="${s.id}">
          <div style="min-width:0">
            <div class="tn">${esc(s.expression)}</div>
            <div class="tm">${s.status === 'enabled' ? '正在匹配新帖' : '已暂停'}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="pause" type="button" data-act="pause">${s.status === 'enabled' ? '暂停' : '恢复'}</button>
            <button class="del" type="button" data-act="del">删除</button>
          </div>
        </div>`)
      .join('');
  }
  renderList();

  body.querySelector('#cc98-sub-add').addEventListener('click', async () => {
    const expression = expressionEl.value.trim();
    if (!expression) {
      toast('请先填写订阅表达式');
      return;
    }
    try {
      await createSubscription({ expression });
      toast('订阅已添加');
      await draw(body);
    } catch (e) {
      toast(e.message || '添加失败');
    }
  });

  expressionEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') body.querySelector('#cc98-sub-add').click();
  });

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const row = e.target.closest('.cc98-sub');
    if (!row) return;
    const id = row.dataset.id;
    const act = btn.dataset.act;
    try {
      if (act === 'del') {
        await deleteSubscription(id);
        toast('已删除');
      } else if (act === 'pause') {
        const s = subs.find((x) => String(x.id) === id);
        await updateSubscription(id, { status: s && s.status === 'enabled' ? 'paused' : 'enabled' });
        toast(s && s.status === 'enabled' ? '已暂停' : '已恢复');
      }
      await draw(body);
    } catch (err) {
      toast(err.message || '操作失败');
    }
  });
}
