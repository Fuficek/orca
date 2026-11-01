import { useEffect, useMemo, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { CircleCheck, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react-native'
import { colors, spacing, typography } from '../../theme/mobile-theme'
import { themedStyleSheet } from '../../theme/themed-styles'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import type { Translate } from '../../i18n/mobile-i18n'
import { openExternalLink } from '../../platform/external-link'
import type { PRCheckDetail } from '../../../../src/shared/github/check-types'
import { hasGitHubCheckHandle, isBrokenCheck } from '../../../../src/shared/pr-checks-fix-prompt'
import { sortChecksBySeverity } from '../../../../src/shared/pr-check-severity-order'
import { fetchPRCheckDetails } from '../../session/github-pr-rpc'
import { buildFixChecksPrompt } from '../../session/pr-ai-triage-prompt'
import { NavBarButton } from '../nav-bar/NavBarButton'
import { ListGroup, ListRow, SectionHeader, LIST_LEADING_INSET } from '../list/ListGroup'
import { AgentLaunchNotice } from '../AgentLaunchNotice'
import { checkOutcome, prCheckKey } from './pr-checks-presentation'
import { NotReady, ScreenFrame, type ScreenProps } from './pr-tab-screen-frame'
import { readyPrData } from './use-mobile-pr-tab'
import { PrCheckFailureCard } from './PrCheckFailureCard'

const PREFETCHED_FAILURES = 3

export function PrChecksScreen({ tab, onBack, bottomInset = 0 }: ScreenProps) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const data = readyPrData(tab)
  const prRepo = data?.pr.prRepo ?? null
  const { checkDetails: cache, ensureCheckDetail: ensure } = tab
  const checks = useMemo(() => sortChecksBySeverity(data?.checks ?? []), [data?.checks])
  // Display follows the shared verdict (approval gates fail too); Fix and Rerun only offer what the host reruns.
  const failing = useMemo(
    () => checks.filter((check) => checkOutcome(check) === 'failure'),
    [checks]
  )
  const running = checks.filter((check) => checkOutcome(check) === 'pending')
  const passed = checks.filter((check) => checkOutcome(check) === 'success')
  const other = checks.filter((check) => checkOutcome(check) === 'neutral')
  const [showPassed, setShowPassed] = useState(false)

  // Open and prefetch only the first few failures; a wide matrix would otherwise fan out one host read per job.
  useEffect(() => {
    failing.slice(0, PREFETCHED_FAILURES).forEach(ensure)
  }, [ensure, failing])

  const refresh = () => tab.refetch({ includeDetails: false })
  const fixChecks = (target: PRCheckDetail[]) => {
    if (!data) {
      return
    }
    const { client, worktreeId } = tab
    void tab.triage.launch('fix-checks', () =>
      buildFixChecksPrompt({
        prNumber: data.pr.number,
        prTitle: data.pr.title,
        prUrl: data.pr.url,
        checks: target,
        loadCheckDetails: async (check) => {
          if (!client || !hasGitHubCheckHandle(check)) {
            return null
          }
          const outcome = await fetchPRCheckDetails(client, worktreeId, {
            checkRunId: check.checkRunId,
            workflowRunId: check.workflowRunId,
            checkName: check.name,
            url: check.url,
            prRepo
          })
          return outcome.ok ? outcome.result : null
        }
      })
    )
  }
  const notice = tab.triage.noticeFor('fix-checks')

  return (
    <ScreenFrame
      title={t('pullRequest.checksSection.title', 'Checks')}
      subtitle={data ? `#${data.pr.number}` : undefined}
      onBack={onBack}
      trailing={
        <NavBarButton
          icon={RefreshCw}
          onPress={refresh}
          accessibilityLabel={t('pullRequest.screens.refreshChecks', 'Refresh checks')}
        />
      }
    >
      {!data ? (
        <NotReady tab={tab} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomInset + spacing.lg }]}
        >
          <ChecksStatusLine
            failing={failing.length}
            running={running.length}
            passed={passed.length}
            t={t}
          />
          {data.checksError ? <Text style={styles.error}>{data.checksError}</Text> : null}
          {data.checks.length === 0 && !data.checksError ? (
            <Text style={styles.muted}>{t('pullRequest.checksSection.noChecks', 'No checks')}</Text>
          ) : null}
          {failing.map((check, index) => (
            <PrCheckFailureCard
              key={prCheckKey(check)}
              initiallyOpen={index < PREFETCHED_FAILURES}
              onOpen={() => ensure(check)}
              check={check}
              entry={cache[prCheckKey(check)]}
              actionable={isBrokenCheck(check)}
              onFix={() => fixChecks([check])}
              fixBusy={tab.triage.isBusy('fix-checks')}
              fixAvailable={tab.triage.availability === 'available'}
              onRerun={tab.actions.rerunFailingChecks}
              rerunBusy={tab.actions.isBusy({ kind: 'rerun' })}
            />
          ))}
          {failing.length > 0 ? (
            <AgentLaunchNotice
              availability={tab.triage.availability}
              success={notice.success}
              error={notice.error}
              warning={notice.warning}
              undeliveredPrompt={notice.undeliveredPrompt}
              errorStyle={styles.error}
            />
          ) : null}
          {tab.actions.error ? <Text style={styles.error}>{tab.actions.error}</Text> : null}
          {running.length > 0 ? (
            <View>
              <SectionHeader
                title={t('pullRequest.screens.runningCount', 'Running {{count}}', {
                  count: running.length
                })}
              />
              <ListGroup separatorInset={LIST_LEADING_INSET}>
                {running.map((check) => (
                  <CheckRow key={prCheckKey(check)} check={check} tone="running" />
                ))}
              </ListGroup>
            </View>
          ) : null}
          {passed.length > 0 ? (
            <View>
              <SectionHeader
                title={t('pullRequest.screens.passedCount', 'Passed {{count}}', {
                  count: passed.length
                })}
              />
              <ListGroup separatorInset={LIST_LEADING_INSET}>
                {showPassed ? (
                  passed.map((check) => (
                    <CheckRow key={prCheckKey(check)} check={check} tone="passed" />
                  ))
                ) : (
                  <ListRow
                    key="folded"
                    title={foldedNames(passed, t)}
                    leading={<CircleCheck size={20} color={colors.statusGreen} strokeWidth={2} />}
                    navigates
                    onPress={() => setShowPassed(true)}
                  />
                )}
              </ListGroup>
            </View>
          ) : null}
          {other.length > 0 ? (
            <View>
              <SectionHeader
                title={t('pullRequest.screens.neutralCount', 'Neutral {{count}}', {
                  count: other.length
                })}
              />
              <ListGroup separatorInset={LIST_LEADING_INSET}>
                {other.map((check) => (
                  <CheckRow key={prCheckKey(check)} check={check} tone="other" />
                ))}
              </ListGroup>
            </View>
          ) : null}
        </ScrollView>
      )}
    </ScreenFrame>
  )
}

function foldedNames(checks: PRCheckDetail[], t: Translate): string {
  const shown = checks.slice(0, 3).map((check) => check.name)
  const rest = checks.length - shown.length
  return rest > 0
    ? t('pullRequest.screens.namesAndMore', '{{names}} and {{count}} more', {
        names: shown.join(', '),
        count: rest
      })
    : shown.join(', ')
}

function ChecksStatusLine({
  failing,
  running,
  passed,
  t
}: {
  failing: number
  running: number
  passed: number
  t: Translate
}) {
  useMobileColorScheme()
  const rest = [
    running > 0 ? t('pullRequest.screens.running', '{{count}} running', { count: running }) : null,
    passed > 0 ? t('pullRequest.checksSection.passed', '{{count}} passed', { count: passed }) : null
  ].filter(Boolean)
  return (
    <Text style={styles.statusLine}>
      {failing > 0 ? (
        <Text style={styles.statusFailing}>
          {t('pullRequest.checksSection.failing', '{{count}} failing', { count: failing })}
        </Text>
      ) : null}
      {failing > 0 && rest.length > 0 ? ' · ' : ''}
      {rest.join(' · ')}
    </Text>
  )
}

function CheckRow({ check, tone }: { check: PRCheckDetail; tone: 'running' | 'passed' | 'other' }) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const Icon = tone === 'running' ? LoaderCircle : CircleCheck
  const color =
    tone === 'running'
      ? colors.statusAmber
      : tone === 'passed'
        ? colors.statusGreen
        : colors.textMuted
  const url = check.url
  return (
    <ListRow
      title={check.name}
      leading={<Icon size={20} color={color} strokeWidth={2} />}
      accessory={
        url ? <ExternalLink size={15} color={colors.textMuted} strokeWidth={2.2} /> : undefined
      }
      onPress={url ? () => openExternalLink(url) : undefined}
      accessibilityLabel={
        url
          ? t('pullRequest.checksSection.openOnWeb', 'Open {{name}} on the web', {
              name: check.name
            })
          : check.name
      }
    />
  )
}

const styles = themedStyleSheet(() => ({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  statusLine: { color: colors.textSecondary, fontSize: 13 },
  statusFailing: { color: colors.statusRed, fontWeight: '600' },
  muted: { color: colors.textSecondary, fontSize: typography.bodySize },
  error: { color: colors.statusRed, fontSize: 13 }
}))
