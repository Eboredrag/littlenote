<script setup lang="ts">
import { LoaderCircle, LockKeyhole } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { useUpload } from '~/stores/upload'

const siteUrl = useSiteUrl()
const title = 'Edit PDF text online, keep the original fonts · littlenote'
const description = 'Fix a name, a date or a typo in your PDF and download it looking untouched, in the same fonts. No account; files are deleted after 30 minutes.'

useSeoMeta({
  title,
  description,
  ogType: 'website',
  ogSiteName: 'littlenote',
  ogTitle: 'Fix the words in your PDF',
  ogDescription: description,
  ogUrl: siteUrl('/'),
  ogImage: siteUrl('/og-image.png'),
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: 'A PDF page with one line being edited, beside the headline “Fix the words in your PDF”.',
  twitterCard: 'summary_large_image',
  robots: 'index, follow',
})

useHead({
  link: [{ rel: 'canonical', href: siteUrl('/') }],
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      'name': 'littlenote',
      'url': siteUrl('/'),
      description,
      'applicationCategory': 'UtilitiesApplication',
      'operatingSystem': 'Any',
      'browserRequirements': 'Requires JavaScript',
      'isAccessibleForFree': true,
      'license': 'https://www.gnu.org/licenses/agpl-3.0.html',
    }),
  }],
})

const upload = useUpload()
const { state, message, pending } = storeToRefs(upload)
const input = ref<HTMLInputElement>()
const dragging = ref(false)
const password = ref('')
const passwordInput = ref<HTMLInputElement>()

watch(state, async (s) => {
  if (s !== 'password') return
  password.value = ''
  await nextTick()
  passwordInput.value?.focus()
}, { immediate: true })

function onPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) upload.open(file)
  ;(e.target as HTMLInputElement).value = ''
}

function onDrop(e: DragEvent) {
  dragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) upload.open(file)
}

function submitPassword() {
  if (pending.value && password.value) upload.open(pending.value, password.value)
}
</script>

<template>
  <main class="intake">
    <header class="brand">
      <img src="/favicon.svg" alt="" width="32" height="32">
      <span>littlenote</span>
    </header>
    <div class="intro">
      <h1>Fix the words in your PDF</h1>
      <p class="lede">Change a name, a date or a typo. The page keeps its own fonts and layout wherever the file allows.</p>
      <p class="promise">
        No account needed. Your file stays on our server only while you edit: it’s deleted 30 minutes after your last change, or the moment you press Delete.
      </p>
      <SourceNotice class="notice" />
    </div>

    <section
      class="sheet"
      :class="{ dragging }"
      aria-labelledby="drop-title"
      @dragover.prevent="dragging = true"
      @dragleave.self="dragging = false"
      @drop.prevent="onDrop"
    >
      <template v-if="state === 'opening'">
        <div class="status" role="status">
          <LoaderCircle class="spin" aria-hidden="true" />
          <p id="drop-title"><strong>Opening {{ pending?.name }}</strong><br>Reading its pages and fonts…</p>
        </div>
      </template>

      <form v-else-if="state === 'password'" class="password" @submit.prevent="submitPassword">
        <LockKeyhole class="lock" aria-hidden="true" />
        <h2 id="drop-title">This PDF has a password</h2>
        <p class="hint">Enter it to open {{ pending?.name }}. The copy you download won’t ask for a password.</p>
        <label class="field">
          <span class="visually-hidden">Password</span>
          <input ref="passwordInput" v-model="password" type="password" autocomplete="current-password" placeholder="Password" :aria-invalid="!!message" aria-describedby="password-error">
        </label>
        <p v-if="message" id="password-error" class="error" role="alert">{{ message }}</p>
        <div class="row">
          <button class="btn" type="button" @click="upload.reset()">Choose another file</button>
          <button class="btn btn-primary" type="submit" :disabled="!password">Open</button>
        </div>
      </form>

      <template v-else>
        <h2 id="drop-title" class="drop-title">Your PDF goes here</h2>
        <button class="btn btn-primary big" type="button" @click="input?.click()">Choose a PDF</button>
        <p class="hint"><span class="fine-pointer">Drop it on this page or choose it · </span><span class="nowrap">Up to 50 MB</span></p>
        <p v-if="state === 'error'" class="error" role="alert">{{ message }}</p>
        <input ref="input" class="visually-hidden" type="file" accept="application/pdf,.pdf" tabindex="-1" aria-hidden="true" @change="onPick">
      </template>
    </section>
  </main>
</template>

<style scoped>
.brand {
  position: absolute;
  top: max(var(--space-5), env(safe-area-inset-top));
  left: var(--space-5);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 1.375rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: var(--ink);
}
.brand img { display: block; border-radius: 9px; }

.intake {
  position: relative;
  min-height: 100dvh;
  display: grid;
  grid-template-columns: minmax(0, 30rem) minmax(0, 440px);
  align-items: center;
  justify-content: center;
  gap: clamp(var(--space-6), 6vw, 96px);
  padding: var(--space-7) var(--space-5) calc(var(--space-7) + env(safe-area-inset-bottom));
}

h1 {
  margin: 0 0 var(--space-4);
  font-size: clamp(2.25rem, 1.4rem + 3.4vw, 4.25rem);
  line-height: 1.02;
  font-weight: 900;
  letter-spacing: -0.03em;
  text-wrap: balance;
}
.lede { margin: 0 0 var(--space-5); font-size: var(--text-lg); line-height: 1.4; color: var(--ink-2); text-wrap: pretty; }
.notice { margin-top: var(--space-4); }
.promise { margin: 0; max-width: 26rem; color: var(--ink-2); font-size: var(--text-sm); line-height: 1.55; text-wrap: pretty; }

/* The drop target is a sheet of paper: the page is the one big thing. */
.sheet {
  position: relative;
  aspect-ratio: 1 / 1.3;
  width: 100%;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: var(--space-3);
  padding: var(--space-6) var(--space-5);
  text-align: center;
  background: #fff;
  border-radius: 6px;
  box-shadow: var(--shadow-page);
  transition: transform 300ms var(--ease-out), box-shadow 240ms ease;
}
.sheet.dragging {
  transform: translateY(-6px) rotate(-0.6deg);
  box-shadow: var(--shadow-float), inset 0 0 0 3px var(--action);
}

.drop-title { margin: 0 0 var(--space-3); font-size: var(--text-lg); font-weight: 850; letter-spacing: -0.01em; }
.big { min-height: 56px; padding: 0 var(--space-6); font-size: var(--text-md); }
h2 { margin: 0; font-size: var(--text-lg); font-weight: 850; }
.hint { margin: 0; color: var(--ink-2); font-size: var(--text-sm); max-width: 24rem; }
@media (pointer: coarse) { .fine-pointer { display: none; } }
.nowrap { white-space: nowrap; }
.error { margin: var(--space-2) 0 0; color: var(--ink); font-weight: 700; font-size: var(--text-sm); max-width: 24rem; }

.status { display: grid; justify-items: center; gap: var(--space-3); }
.status p { margin: 0; color: var(--ink-2); }
.status strong { color: var(--ink); }
.spin { width: 36px; height: 36px; color: var(--action); animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.password { display: grid; justify-items: center; gap: var(--space-3); width: 100%; }
.lock { width: 32px; height: 32px; color: var(--ink-2); }
.field { width: min(300px, 100%); }
.field input {
  width: 100%;
  min-height: 48px;
  padding: 0 var(--space-4);
  border: 2px solid var(--line-strong);
  border-radius: var(--radius-control);
  background: var(--card);
  font-size: var(--text-md);
}
.field input:focus-visible { outline: none; border-color: var(--action); box-shadow: 0 0 0 4px var(--action-tint); }
.field input::placeholder { color: var(--ink-3); }
.row { display: flex; gap: var(--space-2); flex-wrap: wrap; justify-content: center; }

@media (max-width: 860px) {
  .intake { grid-template-columns: minmax(0, 1fr); justify-items: center; align-content: start; gap: var(--space-6); padding-top: 96px; }
  .brand { left: var(--space-4); top: max(var(--space-4), env(safe-area-inset-top)); }
  .intro { max-width: 34rem; }
  .sheet { max-width: 420px; aspect-ratio: auto; min-height: 340px; }
}
</style>
