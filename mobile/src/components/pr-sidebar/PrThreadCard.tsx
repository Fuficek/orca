import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { Check, ExternalLink, Undo2, type LucideIcon } from 'lucide-react-native'
import type { PRComment } from '../../../../src/shared/github/comment-types'
import {
  getPRCommentGroupRoot,
  type PRCommentGroup
} from '../../../../src/shared/pr-comment-groups'
import { isBotPRComment } from '../../../../src/shared/pr-comment-audience'
import {
  colors,
  feedback,
  pressedStyle,
  radii,
  spacing,
  typography
} from '../../theme/mobile-theme'
import { themedStyleSheet } from '../../theme/themed-styles'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import type { Translate } from '../../i18n/mobile-i18n'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { openExternalLink } from '../../platform/external-link'
import { canEditComment, isResolvableComment } from '../../session/pr-comment-actions'
import { ConfirmModal } from '../ConfirmModal'
import { CommentMarkdown } from './CommentMarkdown'
import { PRCommentComposer } from './PRCommentComposer'

export type PRCommentRepoSlug = { owner: string; repo: string; host?: string }

// Stable hook callbacks, so a card re-renders only when its own thread changes.
export type PrThreadActions = {
  reply: (comment: PRComment, body: string) => Promise<boolean>
  toggleResolve: (comment: PRComment) => Promise<boolean>
  editComment: (commentId: number, body: string) => Promise<boolean>
  deleteComment: (commentId: number) => Promise<boolean>
  isReplyBusy: (commentId: number) => boolean
  isResolveBusy: (threadId: string) => boolean
  isEditBusy: (commentId: number) => boolean
  isDeleteBusy: (commentId: number) => boolean
  // Repo slug for the slug-addressed edit/delete RPCs; gates the affordances when absent.
  prRepo: PRCommentRepoSlug | null
}

export function commentRelativeTime(iso: string, now: number, t: Translate): string {
  const timestamp = Date.parse(iso)
  if (Number.isNaN(timestamp)) {
    return ''
  }
  const delta = now - timestamp
  if (delta < 60_000) {
    return t('pullRequest.commentCard.justNow', 'just now')
  }
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 60) {
    const count = minutes
    return count === 1
      ? t('pullRequest.commentCard.minutesAgo_one', '{{count}}m ago', { count })
      : t('pullRequest.commentCard.minutesAgo_other', '{{count}}m ago', { count })
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const count = hours
    return count === 1
      ? t('pullRequest.commentCard.hoursAgo_one', '{{count}}h ago', { count })
      : t('pullRequest.commentCard.hoursAgo_other', '{{count}}h ago', { count })
  }
  const days = Math.floor(hours / 24)
  if (days < 30) {
    const count = days
    return count === 1
      ? t('pullRequest.commentCard.daysAgo_one', '{{count}}d ago', { count })
      : t('pullRequest.commentCard.daysAgo_other', '{{count}}d ago', { count })
  }
  const months = Math.floor(days / 30)
  if (months < 12) {
    const count = months
    return count === 1
      ? t('pullRequest.commentCard.monthsAgo_one', '{{count}}mo ago', { count })
      : t('pullRequest.commentCard.monthsAgo_other', '{{count}}mo ago', { count })
  }
  const count = Math.floor(months / 12)
  return count === 1
    ? t('pullRequest.commentCard.yearsAgo_one', '{{count}}y ago', { count })
    : t('pullRequest.commentCard.yearsAgo_other', '{{count}}y ago', { count })
}

// One review thread or conversation comment: who and where, the comment, its replies in a line each, then its actions.
export function PrThreadCard({
  group,
  actions,
  botAuthorOverrides,
  now
}: {
  group: PRCommentGroup
  actions?: PrThreadActions
  botAuthorOverrides: ReadonlySet<string>
  now: number
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const [replying, setReplying] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const root = getPRCommentGroupRoot(group)
  const replies = group.kind === 'thread' ? group.replies : []
  const bot = isBotPRComment(root, botAuthorOverrides)
  const file = root.path?.split('/').pop()
  const meta = [
    bot ? t('pullRequest.screens.bot', 'bot') : null,
    file ? (bot ? file : t('pullRequest.screens.onFile', 'on {{file}}', { file })) : null,
    commentRelativeTime(root.createdAt, now, t)
  ]
    .filter(Boolean)
    .join(' · ')
  const canResolve = actions !== undefined && isResolvableComment(root)
  const resolveBusy = canResolve && root.threadId ? actions.isResolveBusy(root.threadId) : false
  const canMutate =
    actions !== undefined && group.kind === 'standalone' && canEditComment(root, actions.prRepo)
  return (
    <View style={styles.thread}>
      <View style={styles.who}>
        <Avatar login={root.author} />
        <Text style={styles.author} numberOfLines={1}>
          {root.author}
        </Text>
        <Text style={styles.whoMeta} numberOfLines={1}>
          {meta}
        </Text>
        {root.url ? (
          <Pressable
            onPress={() => openExternalLink(root.url)}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel={t('pullRequest.commentCard.openOnGitHub', 'Open comment on GitHub')}
            style={({ pressed }) => [styles.whoEnd, pressed && pressedStyle]}
          >
            <ExternalLink size={14} color={colors.textMuted} strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>
      {editing && actions ? (
        <PRCommentComposer
          placeholder={t('pullRequest.commentCard.editPlaceholder', 'Edit comment…')}
          submitLabel={t('common.save', 'Save')}
          submitting={actions.isEditBusy(root.id)}
          initialBody={root.body}
          onSubmit={async (body) => {
            const ok = await actions.editComment(root.id, body)
            if (ok) {
              setEditing(false)
            }
            return ok
          }}
          onCancel={() => setEditing(false)}
          autoFocus
        />
      ) : (
        <CommentMarkdown content={root.body} />
      )}
      {replies.map((reply) => (
        <View key={reply.id} style={styles.who}>
          <Avatar login={reply.author} />
          <Text style={styles.replyText} numberOfLines={3}>
            {t('pullRequest.screens.replied', '{{author}} replied: {{body}}', {
              author: reply.author,
              body: reply.body.trim()
            })}
          </Text>
        </View>
      ))}
      {actions && !editing ? (
        <View style={styles.buttons}>
          {canResolve ? (
            <PrMiniButton
              icon={root.isResolved ? Undo2 : Check}
              label={
                root.isResolved
                  ? t('pullRequest.commentCard.unresolve', 'Unresolve')
                  : t('pullRequest.commentCard.resolve', 'Resolve')
              }
              onPress={() => void actions.toggleResolve(root)}
              busy={resolveBusy}
            />
          ) : null}
          {group.kind === 'thread' ? (
            <PrMiniButton
              label={t('pullRequest.commentCard.reply', 'Reply')}
              onPress={() => setReplying((value) => !value)}
            />
          ) : null}
          {canMutate ? (
            <>
              <PrMiniButton label={t('common.edit', 'Edit')} onPress={() => setEditing(true)} />
              <PrMiniButton
                label={t('common.delete', 'Delete')}
                onPress={() => setConfirmDelete(true)}
                busy={actions.isDeleteBusy(root.id)}
              />
            </>
          ) : null}
        </View>
      ) : null}
      {replying && actions ? (
        <PRCommentComposer
          placeholder={t('pullRequest.commentCard.replyPlaceholder', 'Write a reply…')}
          submitLabel={t('pullRequest.commentCard.reply', 'Reply')}
          submitting={actions.isReplyBusy(root.id)}
          onSubmit={async (body) => {
            const ok = await actions.reply(root, body)
            if (ok) {
              setReplying(false)
            }
            return ok
          }}
          onCancel={() => setReplying(false)}
          autoFocus
        />
      ) : null}
      {canMutate ? (
        <ConfirmModal
          visible={confirmDelete}
          title={t('pullRequest.commentCard.deleteConfirmTitle', 'Delete comment?')}
          message={t(
            'pullRequest.commentCard.deleteConfirmMessage',
            'This permanently deletes the comment on GitHub.'
          )}
          confirmLabel={t('common.delete', 'Delete')}
          destructive
          onConfirm={() => void actions.deleteComment(root.id)}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </View>
  )
}

function Avatar({ login }: { login: string }) {
  useMobileColorScheme()
  const initials = login
    .replace(/\[bot\]$/i, '')
    .slice(0, 2)
    .toUpperCase()
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  )
}

export function PrMiniButton({
  icon: Icon,
  label,
  onPress,
  busy = false,
  disabled = false,
  bright = false
}: {
  icon?: LucideIcon
  label: string
  onPress: () => void
  busy?: boolean
  disabled?: boolean
  bright?: boolean
}) {
  useMobileColorScheme()
  const color = bright ? colors.bgBase : colors.textPrimary
  return (
    <Pressable
      style={({ pressed }) => [
        styles.miniButton,
        bright && styles.miniButtonBright,
        disabled && styles.disabled,
        pressed && pressedStyle
      ]}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={color} />
      ) : Icon ? (
        <Icon size={14} color={color} strokeWidth={2.2} />
      ) : null}
      <Text style={[styles.miniLabel, { color }]}>{label}</Text>
    </Pressable>
  )
}

const styles = themedStyleSheet(() => ({
  thread: {
    borderRadius: radii.surface,
    backgroundColor: colors.sheetGroup,
    padding: spacing.md,
    gap: spacing.sm
  },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  author: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', flexShrink: 0 },
  whoMeta: { color: colors.textSecondary, fontSize: typography.metaSize, flexShrink: 1 },
  whoEnd: { marginLeft: 'auto' },
  replyText: { flex: 1, color: colors.textSecondary, fontSize: 13 },
  avatar: {
    width: spacing.xl,
    height: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.bgRaised,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: { color: colors.textPrimary, fontSize: 10, fontWeight: '700' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  miniButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radii.tile,
    backgroundColor: colors.translucentFill
  },
  miniButtonBright: { backgroundColor: colors.surfaceBright },
  miniLabel: { fontSize: 13, fontWeight: '600' },
  disabled: { opacity: feedback.disabledOpacity }
}))
