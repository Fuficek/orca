import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { RefreshCw } from 'lucide-react-native'
import { colors, pressedStyle, spacing, typography } from '../../theme/mobile-theme'
import { themedStyleSheet } from '../../theme/themed-styles'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import {
  groupPRComments,
  getPRCommentGroupId,
  getPRCommentGroupRoot,
  type PRCommentGroup
} from '../../../../src/shared/pr-comment-groups'
import { isBotPRComment } from '../../../../src/shared/pr-comment-audience'
import { canAddRootComment } from '../../session/pr-comment-actions'
import { useNow } from '../../hooks/use-now'
import { useKeyboardOcclusion } from '../../platform/keyboard-occlusion'
import { NavBarButton } from '../nav-bar/NavBarButton'
import { FilterChip } from '../nav-bar/FilterChip'
import { SectionHeader } from '../list/ListGroup'
import { MobileStateView } from '../MobileStateView'
import { PrThreadCard, type PrThreadActions } from './PrThreadCard'
import { PRCommentComposer } from './PRCommentComposer'
import { NotReady, ScreenFrame, type ScreenProps } from './pr-tab-screen-frame'
import { livePrDetails, readyPrData } from './use-mobile-pr-tab'

type CommentsFilter = 'unresolved' | 'all'
// Each card parses Markdown; page so a long timeline cannot stall the JS thread.
const COMMENT_PAGE = 12

export function PrCommentsScreen({ tab, onBack, bottomInset = 0 }: ScreenProps) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const data = readyPrData(tab)
  const details = livePrDetails(data?.details ?? null)
  const now = useNow(60_000)
  const groups = useMemo(() => groupPRComments(details?.comments ?? []), [details])
  const unresolved = groups.filter(isUnresolvedThread)
  const [filter, setFilter] = useState<CommentsFilter>(() =>
    unresolved.length > 0 ? 'unresolved' : 'all'
  )
  const [hideBots, setHideBots] = useState(false)
  const [showResolved, setShowResolved] = useState(false)
  const [resolvedLimit, setResolvedLimit] = useState(COMMENT_PAGE)
  const keyboardHeight = useKeyboardOcclusion()
  const [limit, setLimit] = useState(COMMENT_PAGE)
  const notBot = (group: PRCommentGroup) =>
    !hideBots || !isBotPRComment(getPRCommentGroupRoot(group), tab.botAuthorOverrides)
  const open = (filter === 'unresolved' ? unresolved : groups.filter((g) => !isResolvedGroup(g)))
    .filter(notBot)
    // Unresolved threads lead; conversation comments follow in timeline order.
    .sort((a, b) => Number(isUnresolvedThread(b)) - Number(isUnresolvedThread(a)))
  const resolved = filter === 'all' ? groups.filter(isResolvedGroup).filter(notBot) : []
  const shown = open.slice(0, limit)
  const { commentActions } = tab
  const isPr = details?.item.type === 'pr'
  const cardActions = useMemo<PrThreadActions | undefined>(
    () =>
      isPr
        ? {
            reply: commentActions.reply,
            toggleResolve: commentActions.toggleResolve,
            editComment: commentActions.editComment,
            deleteComment: commentActions.deleteComment,
            isReplyBusy: commentActions.isReplyBusy,
            isResolveBusy: commentActions.isResolveBusy,
            isEditBusy: commentActions.isEditBusy,
            isDeleteBusy: commentActions.isDeleteBusy,
            prRepo: data?.pr.prRepo ?? null
          }
        : undefined,
    [commentActions, data?.pr.prRepo, isPr]
  )
  const canComment = isPr && canAddRootComment(data?.pr.state ?? null)

  return (
    <ScreenFrame
      title={t('pullRequest.commentsSection.title', 'Comments')}
      subtitle={data ? `#${data.pr.number}` : undefined}
      onBack={onBack}
      trailing={
        <NavBarButton
          icon={RefreshCw}
          onPress={() => tab.refetch({ includeDetails: true })}
          accessibilityLabel={t('pullRequest.screens.refreshComments', 'Refresh comments')}
        />
      }
      footer={
        canComment ? (
          // The box sits outside the scroll view, so it lifts itself over the keyboard.
          <View
            style={[
              styles.composerBar,
              keyboardHeight > 0
                ? { marginBottom: keyboardHeight, paddingBottom: spacing.sm }
                : { paddingBottom: Math.max(bottomInset, spacing.md) }
            ]}
          >
            <PRCommentComposer
              placeholder={t('pullRequest.commentsSection.addCommentPlaceholder', 'Add a comment…')}
              submitLabel={t('pullRequest.commentsSection.comment', 'Comment')}
              submitting={commentActions.isRootBusy}
              onSubmit={commentActions.addRootComment}
            />
          </View>
        ) : null
      }
    >
      {!data ? (
        <NotReady tab={tab} />
      ) : data.details === null ? (
        <MobileStateView
          loading
          title={t('components.prSidebar.loading', 'Loading pull request…')}
        />
      ) : !details ? (
        <View style={styles.content}>
          <Text style={styles.muted}>
            {t(
              'pullRequest.commentsSection.commentsLoadFailed',
              'Could not load comments. Tap refresh to try again.'
            )}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.chips}>
            <FilterChip
              label={t('pullRequest.screens.unresolvedCount', 'Unresolved {{count}}', {
                count: unresolved.length
              })}
              active={filter === 'unresolved'}
              onPress={() => {
                setLimit(COMMENT_PAGE)
                setFilter('unresolved')
              }}
            />
            <FilterChip
              label={t('pullRequest.screens.allCount', 'All {{count}}', { count: groups.length })}
              active={filter === 'all'}
              onPress={() => {
                setLimit(COMMENT_PAGE)
                setFilter('all')
              }}
            />
            <FilterChip
              label={t('pullRequest.screens.hideBots', 'Hide bots')}
              active={hideBots}
              onPress={() => setHideBots((value) => !value)}
            />
          </View>
          {shown.length === 0 && resolved.length === 0 ? (
            <Text style={styles.muted}>
              {filter === 'unresolved'
                ? t('pullRequest.screens.noUnresolved', 'No unresolved threads.')
                : t('pullRequest.commentsSection.noComments', 'No comments yet.')}
            </Text>
          ) : null}
          {shown.map((group) => (
            <PrThreadCard
              key={getPRCommentGroupId(group)}
              group={group}
              actions={cardActions}
              botAuthorOverrides={tab.botAuthorOverrides}
              now={now}
            />
          ))}
          {open.length > shown.length ? (
            <Pressable
              onPress={() => setLimit((value) => value + COMMENT_PAGE)}
              accessibilityRole="button"
              style={({ pressed }) => pressed && pressedStyle}
            >
              <Text style={styles.showMore}>
                {t('pullRequest.commentsSection.showMore', 'Show {{count}} more', {
                  count: Math.min(open.length - shown.length, COMMENT_PAGE)
                })}
              </Text>
            </Pressable>
          ) : null}
          {resolved.length > 0 ? (
            <View>
              <SectionHeader
                title={t('pullRequest.screens.resolvedCount', 'Resolved {{count}}', {
                  count: resolved.length
                })}
                expanded={showResolved}
                onToggle={() => setShowResolved((value) => !value)}
              />
              {showResolved
                ? resolved
                    .slice(0, resolvedLimit)
                    .map((group) => (
                      <PrThreadCard
                        key={getPRCommentGroupId(group)}
                        group={group}
                        actions={cardActions}
                        botAuthorOverrides={tab.botAuthorOverrides}
                        now={now}
                      />
                    ))
                : null}
              {showResolved && resolved.length > resolvedLimit ? (
                <Pressable
                  onPress={() => setResolvedLimit((value) => value + COMMENT_PAGE)}
                  accessibilityRole="button"
                  style={({ pressed }) => pressed && pressedStyle}
                >
                  <Text style={styles.showMore}>
                    {t('pullRequest.commentsSection.showMore', 'Show {{count}} more', {
                      count: Math.min(resolved.length - resolvedLimit, COMMENT_PAGE)
                    })}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {commentActions.error ? <Text style={styles.error}>{commentActions.error}</Text> : null}
        </ScrollView>
      )}
    </ScreenFrame>
  )
}

function isUnresolvedThread(group: PRCommentGroup): boolean {
  return group.kind === 'thread' && group.root.isResolved !== true
}

function isResolvedGroup(group: PRCommentGroup): boolean {
  return getPRCommentGroupRoot(group).isResolved === true
}

const styles = themedStyleSheet(() => ({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  muted: { color: colors.textSecondary, fontSize: typography.bodySize },
  error: { color: colors.statusRed, fontSize: 13 },
  chips: { flexDirection: 'row', gap: spacing.sm },
  showMore: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  composerBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.bgBase
  }
}))
