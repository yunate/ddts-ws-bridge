<script setup lang="ts">
import { onUnmounted, ref, shallowRef } from "vue";
import { BridgeRouter, type RemoteObject } from "../../../../../../common/ws_bridge/rpc";
import type { RemoteParent, RemoteSon } from "../../../../../../common/protocol/remoteHierarchy";
import { Validate } from "../../../../../../common/validator";
import {
  createRemoteHierarchy,
  destroyRemoteHierarchy,
} from "../../../../bridge/remote_api/remoteHierarchy";

const parent = shallowRef<RemoteObject<RemoteParent> | null>(null);
const returnedSon = shallowRef<RemoteObject<RemoteSon> | null>(null);
const parentName = ref("Parent A");
const remoteName = ref("");
const sonCallCount = ref<number | null>(null);
const returnedSonCallCount = ref<number | null>(null);
const sonMessage = ref("");
const errorMessage = ref("");
const isBusy = ref(false);
let isMounted = true;

function setError(error: unknown): void {
  errorMessage.value = error instanceof Error ? error.message : "嵌套远端对象操作失败";
}

async function createHierarchy(): Promise<void> {
  if (isBusy.value || parent.value) return;
  isBusy.value = true;
  errorMessage.value = "";
  try {
    const remoteParent = await createRemoteHierarchy(parentName.value);
    if (!isMounted) {
      await destroyRemoteHierarchy(remoteParent);
      return;
    }
    parent.value = remoteParent;
    const result: unknown = await remoteParent.getName();
    Validate.ensureString(result, "远端父对象名称必须是字符串");
    remoteName.value = result;
  } catch (error: unknown) {
    setError(error);
  } finally {
    isBusy.value = false;
  }
}

async function callNestedIncrement(): Promise<void> {
  const remoteParent = parent.value;
  if (!remoteParent || isBusy.value) return;
  isBusy.value = true;
  errorMessage.value = "";
  try {
    const result: unknown = await remoteParent.son.increment();
    Validate.ensureNumber(result, "嵌套方法返回值必须是数字");
    sonCallCount.value = result;
  } catch (error: unknown) {
    setError(error);
  } finally {
    isBusy.value = false;
  }
}

async function callNestedMessage(): Promise<void> {
  const remoteParent = parent.value;
  if (!remoteParent || isBusy.value) return;
  isBusy.value = true;
  errorMessage.value = "";
  try {
    const result: unknown = await remoteParent.son.getMessage();
    Validate.ensureString(result, "嵌套方法返回消息必须是字符串");
    sonMessage.value = result;
  } catch (error: unknown) {
    setError(error);
  } finally {
    isBusy.value = false;
  }
}

async function getSon(): Promise<void> {
  const remoteParent = parent.value;
  if (!remoteParent || returnedSon.value || isBusy.value) return;
  isBusy.value = true;
  errorMessage.value = "";
  try {
    const remoteSon = await remoteParent.getSon();
    if (!isMounted) {
      await BridgeRouter.destroyRemoteObj(remoteSon);
      return;
    }
    returnedSon.value = remoteSon;
  } catch (error: unknown) {
    setError(error);
  } finally {
    isBusy.value = false;
  }
}

async function callReturnedSon(): Promise<void> {
  const remoteSon = returnedSon.value;
  if (!remoteSon || isBusy.value) return;
  isBusy.value = true;
  errorMessage.value = "";
  try {
    const result: unknown = await remoteSon.increment();
    Validate.ensureNumber(result, "getSon 返回的远端对象结果必须是数字");
    returnedSonCallCount.value = result;
  } catch (error: unknown) {
    setError(error);
  } finally {
    isBusy.value = false;
  }
}

async function destroyHierarchy(): Promise<void> {
  const remoteParent = parent.value;
  if (!remoteParent || isBusy.value) return;
  isBusy.value = true;
  errorMessage.value = "";
  try {
    const remoteSon = returnedSon.value;
    if (remoteSon) await BridgeRouter.destroyRemoteObj(remoteSon);
    await destroyRemoteHierarchy(remoteParent);
    parent.value = null;
    returnedSon.value = null;
    remoteName.value = "";
    sonCallCount.value = null;
    returnedSonCallCount.value = null;
    sonMessage.value = "";
  } catch (error: unknown) {
    setError(error);
  } finally {
    isBusy.value = false;
  }
}

onUnmounted(() => {
  isMounted = false;
  const remoteSon = returnedSon.value;
  if (remoteSon) void BridgeRouter.destroyRemoteObj(remoteSon).catch(() => undefined);
  const remoteParent = parent.value;
  if (remoteParent) void destroyRemoteHierarchy(remoteParent).catch(() => undefined);
});
</script>

<template>
  <section class="remote-hierarchy">
    <header class="remote-hierarchy__header">
      <div>
        <h1 class="remote-hierarchy__title">Nested Remote Object</h1>
        <p class="remote-hierarchy__subtitle">
          演示通过 <code>parent.son.method()</code> 以及 <code>await parent.getSon()</code>
          调用服务端嵌套对象。
        </p>
      </div>
      <span class="remote-hierarchy__status" :class="{ 'is-active': parent }">
        {{ parent ? "实例已创建" : "实例未创建" }}
      </span>
    </header>

    <article class="remote-hierarchy__card">
      <div class="remote-hierarchy__field">
        <label for="remote-parent-name">父对象名称</label>
        <input
          id="remote-parent-name"
          v-model="parentName"
          type="text"
          :disabled="Boolean(parent) || isBusy"
          placeholder="输入父对象名称"
        />
      </div>

      <dl class="remote-hierarchy__results" aria-live="polite">
        <div>
          <dt>parent.getName()</dt>
          <dd>{{ remoteName || "--" }}</dd>
        </div>
        <div>
          <dt>parent.son.increment()</dt>
          <dd>{{ sonCallCount ?? "--" }}</dd>
        </div>
        <div>
          <dt>parent.son.getMessage()</dt>
          <dd>{{ sonMessage || "--" }}</dd>
        </div>
        <div>
          <dt>(await parent.getSon()).increment()</dt>
          <dd>{{ returnedSonCallCount ?? "--" }}</dd>
        </div>
      </dl>
    </article>

    <div class="remote-hierarchy__actions">
      <button v-if="!parent" type="button" :disabled="isBusy" @click="createHierarchy">
        创建嵌套对象
      </button>
      <template v-else>
        <button type="button" :disabled="isBusy" @click="callNestedIncrement">调用 increment</button>
        <button type="button" class="is-secondary" :disabled="isBusy" @click="callNestedMessage">
          获取嵌套消息
        </button>
        <button v-if="!returnedSon" type="button" class="is-secondary" :disabled="isBusy" @click="getSon">
          获取 Son 代理
        </button>
        <button v-else type="button" class="is-secondary" :disabled="isBusy" @click="callReturnedSon">
          调用 Son 代理
        </button>
        <button type="button" class="is-danger" :disabled="isBusy" @click="destroyHierarchy">销毁</button>
      </template>
    </div>

    <p v-if="errorMessage" class="remote-hierarchy__error" role="alert">{{ errorMessage }}</p>
  </section>
</template>

<style scoped>
.remote-hierarchy {
  max-width: 760px;
}

.remote-hierarchy__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.remote-hierarchy__title {
  margin: 0 0 var(--space-2);
  font-size: 24px;
}

.remote-hierarchy__subtitle,
.remote-hierarchy__error {
  margin: 0;
  color: var(--color-text-muted);
}

.remote-hierarchy__subtitle code {
  color: var(--color-accent);
}

.remote-hierarchy__status {
  flex: none;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: 13px;
}

.remote-hierarchy__status.is-active {
  border-color: var(--color-success);
  color: var(--color-success);
}

.remote-hierarchy__card {
  display: grid;
  gap: var(--space-6);
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}

.remote-hierarchy__field {
  display: grid;
  gap: var(--space-2);
}

.remote-hierarchy__field label,
.remote-hierarchy__results dt {
  color: var(--color-text-muted);
  font-size: 13px;
}

.remote-hierarchy__field input {
  min-height: 40px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font: inherit;
}

.remote-hierarchy__field input:focus-visible,
.remote-hierarchy__actions button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.remote-hierarchy__field input:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.remote-hierarchy__results {
  display: grid;
  gap: var(--space-3);
  margin: 0;
}

.remote-hierarchy__results div {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: baseline;
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.remote-hierarchy__results dd {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--color-primary);
  font-family: Consolas, "Courier New", monospace;
  text-align: end;
}

.remote-hierarchy__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.remote-hierarchy__actions button {
  min-height: 38px;
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: var(--color-bg);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.remote-hierarchy__actions button.is-secondary {
  border-color: var(--color-border);
  background: var(--color-surface-raised);
  color: var(--color-text);
}

.remote-hierarchy__actions button.is-danger {
  border-color: var(--color-danger);
  background: transparent;
  color: var(--color-danger);
}

.remote-hierarchy__actions button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.remote-hierarchy__error {
  margin-top: var(--space-3);
  color: var(--color-danger);
}

@media (max-width: 640px) {
  .remote-hierarchy__header {
    align-items: stretch;
    flex-direction: column;
  }

  .remote-hierarchy__status {
    align-self: flex-start;
  }

  .remote-hierarchy__results div {
    grid-template-columns: 1fr;
    gap: var(--space-1);
  }

  .remote-hierarchy__results dd {
    text-align: start;
  }

  .remote-hierarchy__actions button {
    flex: 1 1 144px;
  }
}
</style>
