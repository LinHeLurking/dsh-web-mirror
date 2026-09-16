/**
 * Browser half of the mirror plugin: contributes the mirror's card to the
 * DSH web settings page (Plugins section → configurable tab).
 *
 * The card registers into the `settings.plugin.item` slot keyed by the
 * mirror's settings namespace; the settings page pairs it with the
 * Host-served namespace of the same key (registered in src/index.ts via
 * settings.installSection). Reads ride the shared settings describe
 * mirror through ctx.settingsScope; writes go through scope.mutate with
 * the namespace revision fence.
 *
 * The bundle is built by tsdown into the factory CJS form the DSH client
 * module system expects (see tsdown.config.ts): react, cordis, the slots
 * runtime, and the snapshot-store helpers are provided by the web shell's
 * static module table, never bundled.
 */
import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { MIRROR_SETTINGS_NS, type MirrorSettings } from '../settings.js'
import { MirrorCard, type MirrorCardProps, type MirrorCardState } from './MirrorCard.js'
import { injectMirrorCardStyles } from './styles.js'

export const name = '@moonshot-ai/dsh-web-mirror/client'

/** Services the browser half needs from the DSH web composition. */
export const inject = ['slots', 'settingsScope']

/** Minimal structural view of the client settings scope (avoids a hard dep on dsh-client-ui-settings types). */
interface SettingsScopeSnapshot<T> {
  status: 'loading' | 'ready' | 'unavailable'
  value: T | undefined
  user: unknown
  revision: number | undefined
  writable: boolean
}

interface SettingsScope<T> {
  getSnapshot(): SettingsScopeSnapshot<T>
  subscribe(listener: () => void): () => void
  mutate(ops: ReadonlyArray<{ op: 'set'; path: readonly string[]; value: unknown } | { op: 'unset'; path: readonly string[] }>): Promise<void>
}

interface SettingsScopeBinder {
  bind<T>(spec: { namespace: string }): SettingsScope<T>
}

interface SlotRegistration {
  name: string
  key: string
  inject: () => unknown
}

interface SlotsService {
  register<T>(registration: SlotRegistration, component: T): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    settingsScope?: SettingsScopeBinder
    slots?: SlotsService
  }
}

/**
 * Bridges the `web-mirror` settings scope onto the card's staged form and
 * publishes one reactive snapshot for the component.
 */
class MirrorCardController {
  private saving = false
  private failed = false
  private readonly store: SnapshotStore<MirrorCardState>

  constructor(private readonly scope: SettingsScope<MirrorSettings>) {
    this.store = createSnapshotStore<MirrorCardState>(this.project())
    this.scope.subscribe(() => this.publish())
  }

  private project(): MirrorCardState {
    const snap = this.scope.getSnapshot()
    return {
      status: snap.status,
      writable: snap.writable,
      value: snap.value,
      user: snap.user,
      saving: this.saving,
      failed: this.failed,
    }
  }

  private publish(): void {
    this.store.set(this.project())
  }

  private async save(next: MirrorSettings): Promise<void> {
    this.saving = true
    this.failed = false
    this.publish()
    try {
      // Wholesale section write: every field is restated from the staged
      // draft, so a single `set` on the section root is the honest op.
      await this.scope.mutate([{ op: 'set', path: [], value: next }])
    } catch {
      this.failed = true
    } finally {
      this.saving = false
      this.publish()
    }
  }

  inject(): { hooks: { mirrorCard: SnapshotStore<MirrorCardState> }; save: (next: MirrorSettings) => void } {
    return {
      hooks: { mirrorCard: this.store },
      save: (next) => {
        void this.save(next)
      },
    }
  }
}

/** Props the slot runtime assembles: our injected face (hooks bound as useXxx) plus owner props. */
interface MirrorCardSlotProps {
  useMirrorCard: <S>(selector: (state: MirrorCardState) => S) => S
  save: (next: MirrorSettings) => void
}

function MirrorCardSlot(props: MirrorCardSlotProps) {
  const state = props.useMirrorCard((s) => s)
  const cardProps: MirrorCardProps = { state, onSave: props.save }
  return <MirrorCard {...cardProps} />
}

export function apply(ctx: Context): void {
  injectMirrorCardStyles()
  const scope = ctx.settingsScope!.bind<MirrorSettings>({ namespace: MIRROR_SETTINGS_NS })
  const controller = new MirrorCardController(scope)
  ctx.effect(() => {
    const registration: SlotRegistration = {
      name: 'settings.plugin.item',
      key: MIRROR_SETTINGS_NS,
      inject: () => controller.inject(),
    }
    return ctx.slots!.register(registration, MirrorCardSlot)
  }, 'web-mirror: settings card')
}
