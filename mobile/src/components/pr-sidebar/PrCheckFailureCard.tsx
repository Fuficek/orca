import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import {
  ChevronDown,
  CircleX,
  ExternalLink,
  Sparkles,
  SquareTerminal,
  RotateCw
} from 'lucide-react-native'
import { colors, pressedStyle, radii, spacing, typography } from '../../theme/mobile-theme'
import { themedStyleSheet } from '../../theme/themed-styles'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { openExternalLink } from '../../platform/external-link'
import type { PRCheckDetail } from '../../../../src/shared/github/check-types'
import { DisclosureChevron } from '../DisclosureChevron'
import { PRCheckDetailView, type DetailEntry } from './PRCheckDetail'
import { PrMiniButton } from './PrThreadCard'
import { presentCheckDetail } from './pr-check-detail-content'

// A failing check opens with its annotation, and its actions sit on the failure itself.
export function PrCheckFailureCard({
  check,
  entry,
  initiallyOpen,
  onOpen,
  actionable,
  fixLabel,
  onFix,
  fixBusy,
  fixAvailable,
  onRerun,
  rerunBusy
}: {
  check: PRCheckDetail
  entry: DetailEntry | undefined
  initiallyOpen: boolean
  onOpen: () => void
  actionable: boolean
  /** "Fix with Claude" once the launch agent is known. */
  fixLabel: string
  onFix: () => void
  fixBusy: boolean
  fixAvailable: boolean
  onRerun: () => void
  rerunBusy: boolean
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const [open, setOpen] = useState(initiallyOpen)
  const [showLog, setShowLog] = useState(false)
  const content =
    entry?.status === 'loaded' && entry.details ? presentCheckDetail(entry.details) : null
  const annotation = content?.annotations[0] ?? null
  const fallbackLine = content?.jobs[0]?.failedSteps[0]?.name ?? content?.summaryLines[1] ?? null
  return (
    <View style={styles.card}>
      <Pressable
        style={({ pressed }) => [styles.cardHeader, pressed && pressedStyle]}
        onPress={() => {
          if (!open) {
            onOpen()
          }
          setOpen((value) => !value)
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={check.name}
      >
        <CircleX size={20} color={colors.statusRed} strokeWidth={2} />
        <Text style={styles.cardTitle} numberOfLines={1}>
          {check.name}
        </Text>
        <DisclosureChevron expanded={open} collapsedDeg={-90} expandedDeg={0}>
          <ChevronDown size={15} color={colors.textMuted} strokeWidth={2.2} />
        </DisclosureChevron>
      </Pressable>
      {open ? (
        <>
          {!entry || entry.status === 'loading' ? (
            <ActivityIndicator color={colors.textSecondary} />
          ) : entry.status === 'error' ? (
            <Text style={styles.muted}>{entry.message}</Text>
          ) : annotation ? (
            <View style={styles.code}>
              <Text style={styles.codeMuted} numberOfLines={1}>
                {annotation.locator}
              </Text>
              {annotation.title ? <Text style={styles.codeText}>{annotation.title}</Text> : null}
              <Text style={styles.codeError} numberOfLines={6}>
                {annotation.message}
              </Text>
            </View>
          ) : fallbackLine ? (
            <View style={styles.code}>
              <Text style={styles.codeText}>{fallbackLine}</Text>
            </View>
          ) : null}
          <View style={styles.buttons}>
            {actionable ? (
              <>
                <PrMiniButton
                  bright
                  icon={Sparkles}
                  label={fixLabel}
                  onPress={onFix}
                  busy={fixBusy}
                  disabled={!fixAvailable}
                />
                <PrMiniButton
                  icon={RotateCw}
                  label={t('pullRequest.screens.rerun', 'Rerun')}
                  onPress={onRerun}
                  busy={rerunBusy}
                />
              </>
            ) : null}
            {check.url ? (
              <PrMiniButton
                icon={ExternalLink}
                label={t('pullRequest.screens.open', 'Open')}
                onPress={() => check.url && openExternalLink(check.url)}
              />
            ) : null}
            <PrMiniButton
              icon={SquareTerminal}
              label={t('pullRequest.screens.log', 'Log')}
              onPress={() => setShowLog((value) => !value)}
            />
          </View>
          {showLog ? <PRCheckDetailView entry={entry} /> : null}
        </>
      ) : null}
    </View>
  )
}

const styles = themedStyleSheet(() => ({
  muted: { color: colors.textSecondary, fontSize: typography.bodySize },
  card: {
    borderRadius: radii.surface,
    backgroundColor: colors.sheetGroup,
    padding: spacing.md,
    gap: spacing.md
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 28 },
  cardTitle: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '500' },
  code: {
    borderRadius: radii.control,
    backgroundColor: colors.bgPanel,
    padding: spacing.md,
    gap: 2
  },
  codeMuted: {
    color: colors.textSecondary,
    fontFamily: typography.monoFamily,
    fontSize: typography.metaSize
  },
  codeText: {
    color: colors.textPrimary,
    fontFamily: typography.monoFamily,
    fontSize: typography.metaSize
  },
  codeError: {
    color: colors.statusRed,
    fontFamily: typography.monoFamily,
    fontSize: typography.metaSize
  },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }
}))
