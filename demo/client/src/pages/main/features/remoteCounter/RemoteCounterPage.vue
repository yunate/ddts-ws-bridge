<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef } from "vue";
import type { RemoteObject } from "../../../../../../common/ws_bridge/rpc";
import type { RemoteCounter } from "../../../../../../common/protocol/remoteCounter";
import { Validate } from "../../../../../../common/validator";
import { createRemoteCounter, destroyRemoteCounter } from "../../../../bridge/remote_api/remoteCounter";

const counter = shallowRef<RemoteObject<RemoteCounter> | null>(null);
const value = ref<number | null>(null);
const errorMessage = ref("");
const isBusy = ref(false);
let isMounted = true;

function setValue(result: unknown): void {
  Validate.ensureNumber(result, "远端计数器返回值必须是数字");
  value.value = result;
}

function setError(error: unknown): void {
  errorMessage.value = error instanceof Error ? error.message : "远端计数器操作失败";
}

async function createCounter(): Promise<void> {
  if (isBusy.value || counter.value) return;
  isBusy.value = true;
  errorMessage.value = "";
  try {
    const remoteCounter = await createRemoteCounter();
    if (!isMounted) {
      await destroyRemoteCounter(remoteCounter);
      return;
    }
    counter.value = remoteCounter;
    setValue(await remoteCounter.getValue());
  } catch (error: unknown) {
    setError(error);
  } finally {
    isBusy.value = false;
  }
}

async function addOne(): Promise<void> {
  const remoteCounter = counter.value;
  if (!remoteCounter || isBusy.value) return;
  isBusy.value = true;
  errorMessage.value = "";
  try {
    setValue(await remoteCounter.add(1));
  } catch (error: unknown) {
    setError(error);
  } finally {
    isBusy.value = false;
  }
}

async function refreshValue(): Promise<void> {
  const remoteCounter = counter.value;
  if (!remoteCounter || isBusy.value) return;
  isBusy.value = true;
  errorMessage.value = "";
  try {
    setValue(await remoteCounter.getValue());
  } catch (error: unknown) {
    setError(error);
  } finally {
    isBusy.value = false;
  }
}

async function destroyCounter(): Promise<void> {
  const remoteCounter = counter.value;
  if (!remoteCounter || isBusy.value) return;
  isBusy.value = true;
  errorMessage.value = "";
  try {
    await destroyRemoteCounter(remoteCounter);
    counter.value = null;
    value.value = null;
  } catch (error: unknown) {
    setError(error);
  } finally {
    isBusy.value = false;
  }
}

onMounted(() => {
  void createCounter();
});

onUnmounted(() => {
  isMounted = false;
  const remoteCounter = counter.value;
  if (remoteCounter) void destroyRemoteCounter(remoteCounter).catch(() => undefined);
});
</script>

<template>
  <section class="remote-counter">
    <header class="remote-counter__header">
      <div>
        <h1 class="remote-counter__title">Remote Counter</h1>
        <p class="remote-counter__subtitle">服务端实例，通过 WebSocket 代理调用</p>
      </div>
      <span class="remote-counter__status" :class="{ 'is-active': counter }">
        {{ counter ? "实例已创建" : "实例未创建" }}
      </span>
    </header>

    <div class="remote-counter__readout" aria-live="polite">
      <span class="remote-counter__label">Current value</span>
      <strong class="remote-counter__value">{{ value ?? "--" }}</strong>
    </div>

    <div class="remote-counter__actions">
      <button v-if="!counter" type="button" :disabled="isBusy" @click="createCounter">
        创建实例
      </button>
      <template v-else>
        <button type="button" :disabled="isBusy" @click="addOne">+1</button>
        <button type="button" class="is-secondary" :disabled="isBusy" @click="refreshValue">刷新</button>
        <button type="button" class="is-danger" :disabled="isBusy" @click="destroyCounter">销毁</button>
      </template>
    </div>

    <p v-if="errorMessage" class="remote-counter__error" role="alert">{{ errorMessage }}</p>
  </section>
</template>

<style scoped>
.remote-counter {
  max-width: 680px;
}

.remote-counter__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.remote-counter__title {
  margin: 0 0 var(--space-2);
  font-size: 24px;
}

.remote-counter__subtitle,
.remote-counter__error {
  margin: 0;
  color: var(--color-text-muted);
}

.remote-counter__status {
  flex: none;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: 13px;
}

.remote-counter__status.is-active {
  border-color: var(--color-success);
  color: var(--color-success);
}

.remote-counter__readout {
  display: grid;
  gap: var(--space-2);
  min-height: 152px;
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}

.remote-counter__label {
  color: var(--color-text-muted);
  font-size: 13px;
  text-transform: uppercase;
}

.remote-counter__value {
  align-self: end;
  font-family: Consolas, "Courier New", monospace;
  font-size: 56px;
  line-height: 1;
  color: var(--color-primary);
}

.remote-counter__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.remote-counter__actions button {
  min-width: 88px;
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

.remote-counter__actions button.is-secondary {
  border-color: var(--color-border);
  background: var(--color-surface-raised);
  color: var(--color-text);
}

.remote-counter__actions button.is-danger {
  border-color: var(--color-danger);
  background: transparent;
  color: var(--color-danger);
}

.remote-counter__actions button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.remote-counter__actions button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.remote-counter__error {
  margin-top: var(--space-3);
  color: var(--color-danger);
}

@media (max-width: 640px) {
  .remote-counter__header {
    align-items: stretch;
    flex-direction: column;
  }

  .remote-counter__status {
    align-self: flex-start;
  }

  .remote-counter__actions button {
    flex: 1 1 96px;
  }
}
</style>