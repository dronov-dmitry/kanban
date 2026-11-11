import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  type BoardList,
  type BoardVisibility,
  type Card,
  type CardLabel,
  countActiveFilters,
  dueUrgency,
  EMPTY_FILTERS,
  type FilterState,
  keyBetween,
  matchesFilters,
  type PresenceUser,
  parseFilters,
  type RealtimeEvent,
  serializeFilters,
} from '@kanban/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  Button,
  EmptyState,
  Icon,
  Menu,
  MenuItem,
  Modal,
  SkeletonBoard,
  useToast,
} from '../../components/ui';
import { useWorkspace } from '../../components/workspace-context';
import {
  ApiError,
  del,
  downloadWithAuth,
  get,
  OfflineQueuedError,
  patch,
  post,
} from '../../lib/api';
import type { BoardShareLinkRow, BoardSnapshotResponse } from '../../lib/api-types';
import { useAuthStore } from '../../lib/auth-store';
import { useBoard, useMembers, useSavedViews } from '../../lib/queries';
import { useBoardRealtime } from '../../lib/realtime';
import { cn, formatDue, LIST_COLORS, PRIORITY_COLORS } from '../../lib/utils';
import { CardModal } from './CardModal';
import { CardTile } from './CardTile';

interface BoardSearch {
  card?: string;
  f?: string;
  view?: 'list';
  new?: string;
  settings?: string;
}

type PendingMove = { cardId: string; listId: string; position: string; title: string };
type PendingAdd = { listId: string; title: string; limit: number; count: number };

export function BoardPage() {
  const { t, i18n } = useTranslation();
  const { wsSlug, boardId = '' } = useParams({ strict: false }) as {
    wsSlug: string;
    boardId: string;
  };
  const search = useSearch({ strict: false }) as BoardSearch;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { workspace, role } = useWorkspace();
  const boardQuery = useBoard(boardId);
  const membersQuery = useMembers(workspace?.id);
  const viewsQuery = useSavedViews(workspace?.id);
  const currentUser = useAuthStore((state) => state.user);
  const searchRef = useRef(search);
  searchRef.current = search;
  const lastFilterString = useRef(serializeFilters(parseFilters(search.f)));
  const gridRef = useRef<HTMLDivElement>(null);
  const focusIndex = useRef(0);

  const [filters, setFilters] = useState<FilterState>(() => parseFilters(search.f));
  const [filterOpen, setFilterOpen] = useState(Boolean(search.f));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [composerList, setComposerList] = useState<string | null>(null);
  const [composerText, setComposerText] = useState('');
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [editingList, setEditingList] = useState<{ id: string; name: string } | null>(null);
  const [wipEdit, setWipEdit] = useState<{ id: string; name: string; limit: string } | null>(null);
  const [colorEdit, setColorEdit] = useState<{ id: string; name: string; color: string } | null>(
    null,
  );
  const [deleteList, setDeleteList] = useState<BoardList | null>(null);
  const [deleteBoardOpen, setDeleteBoardOpen] = useState(false);
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(search.settings === '1');
  const [settingsName, setSettingsName] = useState('');
  const [settingsDescription, setSettingsDescription] = useState('');
  const [settingsCover, setSettingsCover] = useState(LIST_COLORS[0]!);
  const [settingsVisibility, setSettingsVisibility] = useState<BoardVisibility>('private');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEmails, setShareEmails] = useState('');
  const [shareRole, setShareRole] = useState<'viewer' | 'member'>('viewer');
  const [shareResult, setShareResult] = useState<{
    link: string;
    results: Array<{ email: string; status: string }>;
  } | null>(null);
  const [privateLinks, setPrivateLinks] = useState<BoardShareLinkRow[]>([]);
  const [requestBusy, setRequestBusy] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [activeList, setActiveList] = useState<BoardList | null>(null);
  const [focusedList, setFocusedList] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [online, setOnline] = useState(navigator.onLine);

  const snapshot = boardQuery.data;
  const lists = snapshot?.lists ?? [];
  const cards = snapshot?.cards ?? [];
  const labels = snapshot?.labels ?? [];
  const members = membersQuery.data?.data ?? snapshot?.members ?? [];
  const labelIdsByCard = useMemo(
    () => groupIds(snapshot?.card_labels ?? [], 'card_id', 'label_id'),
    [snapshot],
  );
  const assigneeIdsByCard = useMemo(
    () => groupIds(snapshot?.card_assignees ?? [], 'card_id', 'user_id'),
    [snapshot],
  );
  const checklistStats = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    for (const checklist of snapshot?.checklists ?? []) {
      const current = map.get(checklist.card_id) ?? { done: 0, total: 0 };
      current.done += checklist.items.filter((item) => item.is_done === 1).length;
      current.total += checklist.items.length;
      map.set(checklist.card_id, current);
    }
    return map;
  }, [snapshot]);
  const commentCounts = useMemo(
    () => new Map((snapshot?.comment_counts ?? []).map((row) => [row.card_id, row.count])),
    [snapshot],
  );
  const attachmentCounts = useMemo(
    () => new Map((snapshot?.attachment_counts ?? []).map((row) => [row.card_id, row.count])),
    [snapshot],
  );

  const filteredCards = useMemo(() => {
    if (!snapshot) return [];
    return cards.filter((card) =>
      matchesFilters(card, filters, {
        userId: currentUser?.id ?? '',
        labelIds: labelIdsByCard.get(card.id) ?? [],
        assigneeIds: assigneeIdsByCard.get(card.id) ?? [],
        now: Date.now(),
      }),
    );
  }, [cards, filters, labelIdsByCard, assigneeIdsByCard, snapshot, currentUser?.id]);

  const cardsByList = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const list of lists) map.set(list.id, []);
    for (const card of [...filteredCards].sort((a, b) => a.position.localeCompare(b.position))) {
      map.get(card.list_id)?.push(card);
    }
    return map;
  }, [filteredCards, lists]);

  // URL is the source of truth for shareable filters.
  useEffect(() => {
    const incoming = search.f ?? '';
    if (incoming === lastFilterString.current) return;
    const parsed = parseFilters(search.f);
    lastFilterString.current = serializeFilters(parsed);
    setFilters(parsed);
  }, [search.f]);

  useEffect(() => {
    const serialized = serializeFilters(filters);
    if (serialized === lastFilterString.current) return;
    lastFilterString.current = serialized;
    go({ ...searchRef.current, f: serialized || undefined }, true);
  }, [filters]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    if (search.new === '1' && lists[0]) {
      setComposerList(lists[0].id);
      go({ ...search, new: undefined }, true);
    }
  }, [search.new, lists.length]);

  const realtime = useBoardRealtime(
    boardId,
    (event: RealtimeEvent) => {
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      const cardId = (event.data as { card_id?: string; id?: string } | undefined)?.card_id;
      if (cardId) void queryClient.invalidateQueries({ queryKey: ['card', cardId] });
    },
    () => {
      void queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    },
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );

  const activeFilters = countActiveFilters(filters);
  const effectiveRole = snapshot?.role ?? role;
  const canWrite =
    effectiveRole === 'owner' || effectiveRole === 'admin' || effectiveRole === 'member';
  const canManageBoard = snapshot?.can_manage ?? false;
  const accessRequests = snapshot?.access_requests ?? [];

  function go(next: BoardSearch, replace = false) {
    void navigate({
      to: '/app/$wsSlug/boards/$boardId',
      params: { wsSlug, boardId },
      search: next as any,
      replace,
    });
  }

  function openCard(cardId: string) {
    go({ ...search, card: cardId });
  }

  function closeCard() {
    const { card: _card, ...rest } = search;
    go(rest as BoardSearch);
  }

  function patchSnapshot(mutator: (draft: BoardSnapshotResponse) => void) {
    queryClient.setQueryData<BoardSnapshotResponse>(['board', boardId], (old) => {
      if (!old) return old;
      const draft = structuredClone(old);
      mutator(draft);
      return draft;
    });
  }

  async function runMutation(action: () => Promise<unknown>, options: { rollback?: boolean } = {}) {
    try {
      await action();
      if (options.rollback !== false) {
        await queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      }
    } catch (error) {
      if (error instanceof OfflineQueuedError) {
        toast.push(t('errors.offlineQueued'));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      toast.push(
        error instanceof ApiError
          ? (error.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
        {
          kind: 'danger',
        },
      );
    }
  }

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (id.startsWith('list:')) {
      setActiveList(lists.find((list) => list.id === id.slice(5)) ?? null);
      setActiveCard(null);
    } else {
      setActiveCard(cards.find((card) => card.id === id) ?? null);
      setActiveList(null);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    setActiveList(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith('list:')) {
      const listId = activeId.slice(5);
      const overListId = overId.startsWith('list:')
        ? overId.slice(5)
        : cards.find((card) => card.id === overId)?.list_id;
      if (!overListId || overListId === listId) return;
      const ordered = lists.filter((list) => list.id !== listId);
      const overIndex = ordered.findIndex((list) => list.id === overListId);
      if (overIndex < 0) return;
      const position = keyBetween(
        ordered[overIndex - 1]?.position ?? null,
        ordered[overIndex]?.position ?? null,
      );
      patchSnapshot((draft) => {
        const list = draft.lists.find((item) => item.id === listId);
        if (list) list.position = position;
        draft.lists.sort((a, b) => a.position.localeCompare(b.position));
      });
      void runMutation(() => patch(`/v1/lists/${listId}`, { position }));
      return;
    }

    const card = cards.find((item) => item.id === activeId);
    if (!card) return;
    let targetListId: string;
    let overCard: Card | undefined;
    if (overId.startsWith('list:')) {
      targetListId = overId.slice(5);
    } else {
      overCard = cards.find((item) => item.id === overId);
      targetListId = overCard?.list_id ?? card.list_id;
    }
    if (!targetListId) return;
    const targetList = lists.find((list) => list.id === targetListId);
    if (!targetList) return;

    const targetCards = cards
      .filter((item) => item.list_id === targetListId && item.id !== card.id)
      .sort((a, b) => a.position.localeCompare(b.position));
    let insertAt = targetCards.length;
    if (overCard) {
      const index = targetCards.findIndex((item) => item.id === overCard.id);
      if (index >= 0) insertAt = index;
    }
    const lower = targetCards[insertAt - 1]?.position ?? null;
    const upper = targetCards[insertAt]?.position ?? null;
    let position: string;
    try {
      position = keyBetween(lower, upper);
    } catch {
      position = keyBetween(targetCards[targetCards.length - 1]?.position ?? null, null);
    }

    const movingBetweenLists = card.list_id !== targetListId;
    if (
      movingBetweenLists &&
      targetList.wip_limit !== null &&
      targetCards.length >= targetList.wip_limit
    ) {
      setPendingMove({ cardId: card.id, listId: targetListId, position, title: card.title });
      return;
    }
    void performMove(card.id, targetListId, position);
  }

  async function performMove(cardId: string, listId: string, position: string) {
    const original = cards.find((item) => item.id === cardId);
    patchSnapshot((draft) => {
      const card = draft.cards.find((item) => item.id === cardId);
      if (card) {
        card.list_id = listId;
        card.position = position;
        card.version += 1;
      }
      draft.cards.sort((a, b) => a.position.localeCompare(b.position));
    });
    await runMutation(() => post(`/v1/cards/${cardId}/move`, { listId, position }), {
      rollback: false,
    });
    if (original && original.list_id !== listId) {
      toast.push(t('toast.cardMoved'), {
        action: {
          label: t('common.undo'),
          onClick: () => {
            void post(`/v1/cards/${cardId}/move`, {
              listId: original.list_id,
              position: original.position,
            }).then(() => queryClient.invalidateQueries({ queryKey: ['board', boardId] }));
          },
        },
      });
    }
  }

  async function createCard(listId: string, title: string) {
    const list = lists.find((item) => item.id === listId);
    if (!list || !title.trim()) return;
    const count = cards.filter(
      (card) => card.list_id === listId && card.deleted_at === null,
    ).length;
    if (list.wip_limit !== null && count >= list.wip_limit) {
      setPendingAdd({ listId, title: title.trim(), limit: list.wip_limit, count });
      return;
    }
    await doCreateCard(listId, title.trim());
  }

  async function doCreateCard(listId: string, title: string) {
    const tempId = `tmp_${Date.now()}`;
    const listCards = cards
      .filter((card) => card.list_id === listId)
      .sort((a, b) => a.position.localeCompare(b.position));
    const tempCard: Card = {
      id: tempId,
      board_id: boardId,
      list_id: listId,
      title,
      description: '',
      position: keyBetween(listCards[listCards.length - 1]?.position ?? null, null),
      priority: 'normal',
      start_date: null,
      due_date: null,
      due_done: 0,
      is_blocked: 0,
      cover_ref: null,
      version: 1,
      created_by: '',
      created_at: Date.now(),
      updated_at: Date.now(),
      archived_at: null,
      deleted_at: null,
    };
    patchSnapshot((draft) => {
      draft.cards.push(tempCard);
    });
    try {
      await post(`/v1/lists/${listId}/cards`, { title });
      await queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      setComposerText('');
      setComposerList(listId);
    } catch (error) {
      if (error instanceof OfflineQueuedError) {
        toast.push(t('errors.offlineQueued'));
        setComposerText('');
        return;
      }
      patchSnapshot((draft) => {
        draft.cards = draft.cards.filter((card) => card.id !== tempId);
      });
      toast.push(
        error instanceof ApiError
          ? (error.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
        {
          kind: 'danger',
        },
      );
    }
  }

  async function addList() {
    if (!newListName.trim()) return;
    try {
      await post(`/v1/boards/${boardId}/lists`, { name: newListName.trim() });
      setNewListName('');
      setNewListOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  async function saveListName() {
    if (!editingList) return;
    const list = editingList;
    setEditingList(null);
    if (!list.name.trim()) return;
    try {
      await patch(`/v1/lists/${list.id}`, { name: list.name.trim() });
      await queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  async function toggleCollapse(list: BoardList) {
    const next = new Set(collapsed);
    if (next.has(list.id)) next.delete(list.id);
    else next.add(list.id);
    setCollapsed(next);
    try {
      await patch(`/v1/lists/${list.id}`, { isCollapsed: next.has(list.id) });
    } catch {
      // local-only fallback is acceptable
    }
  }

  async function saveWip() {
    if (!wipEdit) return;
    const limit = wipEdit.limit.trim() === '' ? null : Number(wipEdit.limit);
    try {
      await patch(`/v1/lists/${wipEdit.id}`, { wipLimit: limit && limit > 0 ? limit : null });
      setWipEdit(null);
      await queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  async function saveColor() {
    if (!colorEdit) return;
    await patch(`/v1/lists/${colorEdit.id}`, { color: colorEdit.color }).catch(() => undefined);
    setColorEdit(null);
    await queryClient.invalidateQueries({ queryKey: ['board', boardId] });
  }

  async function archiveList() {
    if (!deleteList) return;
    const list = deleteList;
    setDeleteList(null);
    try {
      await del(`/v1/lists/${list.id}`);
      await queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  async function archiveBoard() {
    try {
      await patch(`/v1/boards/${boardId}`, { archived: true });
      toast.push(t('common.archive'), { kind: 'success' });
      await navigate({ to: '/app/$wsSlug', params: { wsSlug } });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  async function removeBoard() {
    setDeleteBoardOpen(false);
    try {
      await del(`/v1/boards/${boardId}`);
      await navigate({ to: '/app/$wsSlug', params: { wsSlug } });
      toast.push(t('toast.boardTrashed'), {
        action: {
          label: t('common.restore'),
          onClick: () => {
            void post(`/v1/boards/${boardId}/restore`).then(() =>
              navigate({ to: '/app/$wsSlug/boards/$boardId', params: { wsSlug, boardId } }),
            );
          },
        },
      });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  async function duplicateBoard() {
    try {
      const response = await post<{ board_id: string }>(`/v1/boards/${boardId}/duplicate`, {
        locale: i18n.language === 'en' ? 'en' : 'ru',
      });
      await queryClient.invalidateQueries({ queryKey: ['boards', workspace?.id] });
      await navigate({
        to: '/app/$wsSlug/boards/$boardId',
        params: { wsSlug, boardId: response.board_id },
      });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  async function saveBoardSettings() {
    try {
      const payload: Record<string, unknown> = {
        name: settingsName.trim(),
        description: settingsDescription.trim() || null,
        cover: settingsCover,
      };
      if (canManageBoard) payload.visibility = settingsVisibility;
      await patch(`/v1/boards/${boardId}`, payload);
      setBoardSettingsOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    } catch (error) {
      toast.push(
        error instanceof ApiError
          ? (error.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
        { kind: 'danger' },
      );
    }
  }

  async function saveView() {
    if (!viewName.trim() || !workspace) return;
    try {
      await post(`/v1/workspaces/${workspace.id}/views`, {
        name: viewName.trim(),
        filters: serializeFilters(filters),
        boardId,
      });
      setSaveViewOpen(false);
      setViewName('');
      await queryClient.invalidateQueries({ queryKey: ['views', workspace.id] });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  function publicShareLink(): string {
    const current = snapshot?.board;
    if (current?.visibility === 'public' && current.public_token) {
      return new URL(
        `${import.meta.env.BASE_URL}share/board/${current.public_token}`,
        window.location.origin,
      ).toString();
    }
    return '';
  }

  async function loadShareLinks() {
    try {
      const response = await get<{ data: BoardShareLinkRow[] }>(
        `/v1/boards/${boardId}/share-links`,
      );
      setPrivateLinks(response.data);
    } catch {
      setPrivateLinks([]);
    }
  }

  async function createPrivateShareLink(): Promise<BoardShareLinkRow | null> {
    try {
      const response = await post<{ link: BoardShareLinkRow }>(
        `/v1/boards/${boardId}/share-links`,
        { role: shareRole },
      );
      setPrivateLinks((current) => [
        response.link,
        ...current.filter((item) => item.id !== response.link.id),
      ]);
      toast.push(t('board.shareLinkCreated'), { kind: 'success' });
      return response.link;
    } catch (error) {
      toast.push(
        error instanceof ApiError
          ? (error.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
        { kind: 'danger' },
      );
      return null;
    }
  }

  async function revokePrivateShareLink(id: string) {
    await del(`/v1/boards/${boardId}/share-links/${id}`);
    setPrivateLinks((current) => current.filter((item) => item.id !== id));
  }

  async function copyShareLink(url?: string) {
    let target = url ?? publicShareLink();
    if (!target && snapshot?.board.visibility !== 'public') {
      target = privateLinks[0]?.url ?? (await createPrivateShareLink())?.url ?? '';
    }
    if (!target) return;
    void navigator.clipboard.writeText(target);
    toast.push(t('common.copied'), { kind: 'success' });
  }

  function openShare() {
    setShareOpen(true);
    setShareResult(null);
    if (snapshot?.board.visibility !== 'public') void loadShareLinks();
  }

  async function changeVisibility(next: BoardVisibility) {
    try {
      await patch(`/v1/boards/${boardId}`, { visibility: next });
      setSettingsVisibility(next);
      setShareResult(null);
      await queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      toast.push(t('common.saved'), { kind: 'success' });
    } catch (error) {
      toast.push(
        error instanceof ApiError
          ? (error.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
        { kind: 'danger' },
      );
    }
  }

  async function sendShareLinks() {
    const emails = shareEmails
      .split(/[\s,;]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (emails.length === 0) return;
    try {
      const response = await post<{
        link: string;
        results: Array<{ email: string; status: string }>;
      }>(`/v1/boards/${boardId}/share`, { emails, role: shareRole });
      setShareResult(response);
      setShareEmails('');
      await queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      setShareOpen(true);
      toast.push(t('common.saved'), { kind: 'success' });
    } catch (error) {
      toast.push(
        error instanceof ApiError
          ? (error.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
        { kind: 'danger' },
      );
    }
  }

  async function approveAccessRequest(requestId: string, nextRole: 'viewer' | 'member') {
    setRequestBusy(requestId);
    try {
      await post(`/v1/boards/${boardId}/access-requests/${requestId}/approve`, { role: nextRole });
      await queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      toast.push(t('board.accessApproved'), { kind: 'success' });
    } catch (error) {
      toast.push(
        error instanceof ApiError
          ? (error.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
        { kind: 'danger' },
      );
    } finally {
      setRequestBusy(null);
    }
  }

  async function rejectAccessRequest(requestId: string) {
    setRequestBusy(requestId);
    try {
      await post(`/v1/boards/${boardId}/access-requests/${requestId}/reject`);
      await queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      toast.push(t('board.accessRejected'), { kind: 'success' });
    } catch (error) {
      toast.push(
        error instanceof ApiError
          ? (error.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
        { kind: 'danger' },
      );
    } finally {
      setRequestBusy(null);
    }
  }

  async function assignMe(cardId: string) {
    const current = assigneeIdsByCard.get(cardId) ?? [];
    if (current.length === 0) {
      toast.push(t('common.error'), { kind: 'danger' });
      return;
    }
    const user = currentUser;
    if (!user) return;
    const next = current.includes(user.id) ? current : [...current, user.id];
    await runMutation(() => patch(`/v1/cards/${cardId}`, { assigneeIds: next }), {
      rollback: false,
    });
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editable =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (editable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'n') {
        event.preventDefault();
        const listId = focusedList ?? lists[0]?.id;
        if (listId) {
          setComposerList(listId);
          setComposerText('');
        }
      }
      if (key === 'f') {
        event.preventDefault();
        setFilterOpen((value) => !value);
      }
      if (key === 'j' || key === 'k') {
        const cardsOnScreen = Array.from(document.querySelectorAll<HTMLElement>('[data-card-id]'));
        if (cardsOnScreen.length === 0) return;
        event.preventDefault();
        focusIndex.current = Math.max(
          0,
          Math.min(cardsOnScreen.length - 1, focusIndex.current + (key === 'j' ? 1 : -1)),
        );
        cardsOnScreen[focusIndex.current]?.focus();
      }
      if (key === 'e') {
        const cardId = (document.activeElement as HTMLElement | null)?.dataset.cardId;
        if (cardId) {
          event.preventDefault();
          openCard(cardId);
        }
      }
      if (key === 'a') {
        const cardId = (document.activeElement as HTMLElement | null)?.dataset.cardId;
        if (cardId) {
          event.preventDefault();
          void assignMe(cardId);
        }
      }
      if (key === 'd') {
        const cardId = (document.activeElement as HTMLElement | null)?.dataset.cardId;
        if (cardId) {
          event.preventDefault();
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(9, 0, 0, 0);
          const card = cards.find((item) => item.id === cardId);
          void runMutation(
            () =>
              patch(`/v1/cards/${cardId}`, {
                dueDate: card?.due_date ? null : tomorrow.getTime(),
              }),
            { rollback: false },
          );
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusedList, lists, cards, runMutation, openCard, assignMe]);

  if (boardQuery.isLoading && !snapshot) return <SkeletonBoard />;

  if (!snapshot) {
    return (
      <div className="page">
        <EmptyState
          icon="board"
          title={t('errors.notFound')}
          action={
            <Link to="/app/$wsSlug" params={{ wsSlug }} className="btn">
              {t('common.back')}
            </Link>
          }
        />
      </div>
    );
  }

  const board = snapshot.board;
  const isList = search.view === 'list';
  const visibleLists = lists.filter(
    (list) => !filters.hideEmpty || (cardsByList.get(list.id)?.length ?? 0) > 0,
  );
  const boardCards = filteredCards.filter((card) => card.archived_at === null);

  return (
    <div className="board-page">
      <div className="board-toolbar">
        <div className="breadcrumbs">
          {workspace ? (
            <Link to="/app/$wsSlug" params={{ wsSlug }}>
              {workspace.name}
            </Link>
          ) : (
            <span>{snapshot.workspace.name}</span>
          )}
          <Icon name="chevron-right" size={13} />
          <span className="current">{board.name}</span>
          {board.visibility === 'public' ? (
            <span className="badge" style={{ marginLeft: 4 }}>
              {t('board.public')}
            </span>
          ) : null}
          {board.is_favorite ? <span style={{ color: 'var(--color-warning)' }}>★</span> : null}
        </div>

        <div className="row" style={{ marginLeft: 8 }}>
          <Button
            size="sm"
            variant={isList ? 'default' : 'soft'}
            icon="board"
            onClick={() => go({ ...search, view: undefined })}
          >
            <span className="hide-mobile">{t('board.boardView')}</span>
          </Button>
          <Button
            size="sm"
            variant={isList ? 'soft' : 'default'}
            icon="list"
            onClick={() => go({ ...search, view: 'list' })}
          >
            <span className="hide-mobile">{t('board.listView')}</span>
          </Button>
          <Button
            size="sm"
            icon="filter"
            variant={activeFilters > 0 ? 'soft' : 'default'}
            onClick={() => setFilterOpen((value) => !value)}
          >
            {t('common.filter')}
            {activeFilters > 0 ? <span className="badge primary">{activeFilters}</span> : null}
          </Button>
        </div>

        <div className="topbar-right">
          {realtime.presence.length > 0 ? <Presence users={realtime.presence} /> : null}
          <span
            title={realtime.connected ? t('common.online') : t('common.offline')}
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: realtime.connected ? 'var(--color-success)' : 'var(--color-warning)',
            }}
          />
          <Button size="sm" icon="user" onClick={openShare}>
            <span className="hide-mobile">{t('board.share')}</span>
            {accessRequests.length > 0 ? (
              <span className="badge primary" style={{ marginLeft: 4 }}>
                {accessRequests.length}
              </span>
            ) : null}
          </Button>
          <Menu
            trigger={(props) => (
              <Button size="sm" icon="more" aria-label={t('common.actions')} {...props} />
            )}
          >
            <MenuItem
              icon="edit"
              onClick={() => {
                setSettingsName(board.name);
                setSettingsDescription(board.description ?? '');
                setSettingsCover(board.cover ?? LIST_COLORS[0]!);
                setSettingsVisibility(board.visibility ?? 'private');
                setBoardSettingsOpen(true);
              }}
            >
              {t('board.boardSettings')}
            </MenuItem>
            <MenuItem icon="duplicate" onClick={() => void duplicateBoard()}>
              {t('common.duplicate')}
            </MenuItem>
            <MenuItem
              icon="download"
              onClick={() =>
                void downloadWithAuth(
                  `/v1/boards/${boardId}/export?format=json&locale=${i18n.language === 'en' ? 'en' : 'ru'}`,
                  `${board.name}.json`,
                )
              }
            >
              {t('board.exportJson')}
            </MenuItem>
            <MenuItem
              icon="download"
              onClick={() =>
                void downloadWithAuth(
                  `/v1/boards/${boardId}/export?format=csv&locale=${i18n.language === 'en' ? 'en' : 'ru'}`,
                  `${board.name}.csv`,
                )
              }
            >
              {t('board.exportCsv')}
            </MenuItem>
            <MenuItem
              icon="download"
              onClick={() =>
                void downloadWithAuth(
                  `/v1/boards/${boardId}/export?format=md&locale=${i18n.language === 'en' ? 'en' : 'ru'}`,
                  `${board.name}.md`,
                )
              }
            >
              {t('board.exportMd')}
            </MenuItem>
            <div className="menu-separator" />
            <MenuItem icon="archive" onClick={() => void archiveBoard()}>
              {t('board.archiveBoard')}
            </MenuItem>
            <MenuItem icon="trash" danger onClick={() => setDeleteBoardOpen(true)}>
              {t('board.deleteBoard')}
            </MenuItem>
          </Menu>
        </div>
      </div>

      {!online || boardQuery.fromCache ? (
        <div className="banner" role="status">
          <Icon name="wifi-off" size={15} />
          <span className="grow">
            {t('common.offline')}. {t('board.localChanges')}
          </span>
        </div>
      ) : null}

      {filterOpen ? (
        <FilterPanel
          filters={filters}
          setFilters={setFilters}
          labels={labels}
          members={members}
          views={viewsQuery.data?.data ?? []}
          onReset={() =>
            setFilters({ ...EMPTY_FILTERS, assignees: [], labels: [], priorities: [] })
          }
          onApplyView={(value) => setFilters(parseFilters(value))}
          onSaveView={() => setSaveViewOpen(true)}
        />
      ) : null}

      {isList ? (
        <div className="content" style={{ padding: 16 }}>
          {boardCards.length === 0 ? (
            <EmptyState
              icon="search"
              title={activeFilters > 0 ? t('board.emptyFilter') : t('board.emptyTitle')}
              text={activeFilters > 0 ? undefined : t('board.emptyText')}
              action={
                activeFilters > 0 ? (
                  <Button
                    onClick={() =>
                      setFilters({ ...EMPTY_FILTERS, assignees: [], labels: [], priorities: [] })
                    }
                  >
                    {t('board.resetFilters')}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ListTable
              lists={lists}
              cards={boardCards}
              labelsById={new Map(labels.map((label) => [label.id, label]))}
              labelIdsByCard={labelIdsByCard}
              assigneesByCard={assigneeIdsByCard}
              members={members}
              checklistStats={checklistStats}
              onOpen={openCard}
            />
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div
            className="board-canvas"
            ref={gridRef}
            onFocusCapture={(event) => {
              const column = (event.target as HTMLElement).closest<HTMLElement>('[data-list-id]');
              if (column?.dataset.listId) setFocusedList(column.dataset.listId);
            }}
          >
            <SortableContext
              items={visibleLists.map((list) => `list:${list.id}`)}
              strategy={horizontalListSortingStrategy}
            >
              {visibleLists.map((list) => {
                const listCards = cardsByList.get(list.id) ?? [];
                const collapsedNow = collapsed.has(list.id);
                return (
                  <SortableColumn
                    key={list.id}
                    list={list}
                    collapsed={collapsedNow}
                    count={listCards.length}
                    canWrite={canWrite}
                    onCollapse={() => void toggleCollapse(list)}
                    onRename={() => setEditingList({ id: list.id, name: list.name })}
                    onWip={() =>
                      setWipEdit({
                        id: list.id,
                        name: list.name,
                        limit: list.wip_limit?.toString() ?? '',
                      })
                    }
                    onColor={() =>
                      setColorEdit({
                        id: list.id,
                        name: list.name,
                        color: list.color ?? LIST_COLORS[0]!,
                      })
                    }
                    onArchive={() => setDeleteList(list)}
                  >
                    {editingList?.id === list.id ? (
                      <input
                        className="input"
                        style={{ minHeight: 30, marginBottom: 6 }}
                        data-autofocus
                        value={editingList.name}
                        onChange={(event) =>
                          setEditingList({ ...editingList, name: event.target.value })
                        }
                        onBlur={() => void saveListName()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void saveListName();
                          if (event.key === 'Escape') setEditingList(null);
                        }}
                      />
                    ) : null}
                    {collapsedNow ? null : (
                      <>
                        <SortableContext
                          items={listCards.map((card) => card.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="card-list">
                            {listCards.map((card) => (
                              <SortableCard
                                key={card.id}
                                card={card}
                                labels={
                                  (labelIdsByCard.get(card.id) ?? [])
                                    .map((id) => labels.find((label) => label.id === id))
                                    .filter(Boolean) as CardLabel[]
                                }
                                assignees={assigneeIdsByCard.get(card.id) ?? []}
                                members={members}
                                checklist={checklistStats.get(card.id) ?? { done: 0, total: 0 }}
                                commentCount={commentCounts.get(card.id) ?? 0}
                                attachmentCount={attachmentCounts.get(card.id) ?? 0}
                                selected={search.card === card.id}
                                onOpen={() => openCard(card.id)}
                              />
                            ))}
                          </div>
                        </SortableContext>
                        {composerList === list.id ? (
                          <div className="composer">
                            <textarea
                              data-autofocus
                              value={composerText}
                              placeholder={t('card.title')}
                              onChange={(event) => setComposerText(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                  event.preventDefault();
                                  void createCard(list.id, composerText);
                                }
                                if (event.key === 'Escape') {
                                  setComposerList(null);
                                  setComposerText('');
                                }
                              }}
                            />
                            <div className="row">
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => void createCard(list.id, composerText)}
                              >
                                {t('common.add')}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setComposerList(null)}
                              >
                                {t('common.cancel')}
                              </Button>
                            </div>
                          </div>
                        ) : canWrite ? (
                          <button
                            type="button"
                            className="add-card"
                            onClick={() => {
                              setComposerList(list.id);
                              setComposerText('');
                            }}
                          >
                            {t('board.addCard')}
                          </button>
                        ) : null}
                      </>
                    )}
                    {collapsedNow ? (
                      <div
                        style={{
                          writingMode: 'vertical-rl',
                          padding: 8,
                          fontSize: 12,
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {list.name} · {listCards.length}
                      </div>
                    ) : null}
                  </SortableColumn>
                );
              })}
            </SortableContext>

            {canWrite ? (
              <div style={{ width: 260, flex: 'none' }}>
                {newListOpen ? (
                  <div className="composer" style={{ marginTop: 2 }}>
                    <input
                      className="input"
                      data-autofocus
                      placeholder={t('board.listName')}
                      value={newListName}
                      onChange={(event) => setNewListName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void addList();
                        if (event.key === 'Escape') setNewListOpen(false);
                      }}
                    />
                    <div className="row">
                      <Button size="sm" variant="primary" onClick={() => void addList()}>
                        {t('common.add')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setNewListOpen(false)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="add-card"
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                    }}
                    onClick={() => setNewListOpen(true)}
                  >
                    {t('board.addList')}
                  </button>
                )}
              </div>
            ) : null}
          </div>

          <DragOverlay>
            {activeCard ? (
              <div className="drag-overlay" style={{ width: 272 }}>
                <CardTile
                  card={activeCard}
                  labels={
                    (labelIdsByCard.get(activeCard.id) ?? [])
                      .map((id) => labels.find((label) => label.id === id))
                      .filter(Boolean) as CardLabel[]
                  }
                  assignees={assigneeIdsByCard.get(activeCard.id) ?? []}
                  members={members}
                  checklist={checklistStats.get(activeCard.id) ?? { done: 0, total: 0 }}
                  commentCount={commentCounts.get(activeCard.id) ?? 0}
                  attachmentCount={attachmentCounts.get(activeCard.id) ?? 0}
                />
              </div>
            ) : activeList ? (
              <div className="column" style={{ padding: 12, width: 288 }}>
                <div className="strong small">{activeList.name}</div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {boardCards.length === 0 && activeFilters === 0 && !isList ? (
        <div style={{ padding: '0 24px 24px' }}>
          <EmptyState
            icon="board"
            title={t('board.emptyTitle')}
            text={t('board.emptyText')}
            action={
              canWrite ? (
                <Button
                  variant="primary"
                  icon="plus"
                  onClick={() => lists[0] && setComposerList(lists[0].id)}
                >
                  {t('board.addCard')}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : null}

      {boardQuery.isFetching && !boardQuery.isLoading ? (
        <div className="caption subtle" style={{ position: 'absolute', top: 8, right: 16 }}>
          {t('common.updating')}
        </div>
      ) : null}

      {search.card ? <CardModal cardId={search.card} onClose={closeCard} /> : null}

      <Modal
        open={Boolean(pendingMove)}
        onClose={() => setPendingMove(null)}
        title={t('board.wipLimit')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingMove(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const move = pendingMove;
                setPendingMove(null);
                if (move) void performMove(move.cardId, move.listId, move.position);
              }}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p className="small">
          {t('board.wipExceeded', {
            name: lists.find((list) => list.id === pendingMove?.listId)?.name ?? '',
            count: cards.filter((card) => card.list_id === pendingMove?.listId).length,
            limit: lists.find((list) => list.id === pendingMove?.listId)?.wip_limit ?? 0,
          })}
        </p>
      </Modal>

      <Modal
        open={Boolean(pendingAdd)}
        onClose={() => setPendingAdd(null)}
        title={t('board.wipLimit')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingAdd(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const add = pendingAdd;
                setPendingAdd(null);
                if (add) void doCreateCard(add.listId, add.title);
              }}
            >
              {t('common.add')}
            </Button>
          </>
        }
      >
        <p className="small">
          {t('board.wipExceeded', {
            name: lists.find((list) => list.id === pendingAdd?.listId)?.name ?? '',
            count: pendingAdd?.count ?? 0,
            limit: pendingAdd?.limit ?? 0,
          })}
        </p>
      </Modal>

      <Modal
        open={Boolean(wipEdit)}
        onClose={() => setWipEdit(null)}
        title={`${t('board.wipLimit')} — ${wipEdit?.name ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setWipEdit(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void saveWip()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <label className="label" htmlFor="wip-limit">
          {t('board.wipLimit')}
        </label>
        <input
          id="wip-limit"
          className="input"
          type="number"
          min={1}
          max={999}
          value={wipEdit?.limit ?? ''}
          onChange={(event) => wipEdit && setWipEdit({ ...wipEdit, limit: event.target.value })}
          placeholder="—"
        />
      </Modal>

      <Modal
        open={Boolean(colorEdit)}
        onClose={() => setColorEdit(null)}
        title={`${t('workspace.cover')} — ${colorEdit?.name ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setColorEdit(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void saveColor()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="row wrap">
          {LIST_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              onClick={() => colorEdit && setColorEdit({ ...colorEdit, color })}
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                background: color,
                border:
                  colorEdit?.color === color
                    ? '3px solid var(--color-text)'
                    : '2px solid var(--color-surface)',
                boxShadow: 'var(--shadow-1)',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteList)}
        onClose={() => setDeleteList(null)}
        title={t('board.deleteList')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteList(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void archiveList()}>
              {t('common.archive')}
            </Button>
          </>
        }
      >
        <p className="small">{deleteList?.name}</p>
      </Modal>

      <Modal
        open={deleteBoardOpen}
        onClose={() => setDeleteBoardOpen(false)}
        title={t('board.deleteBoard')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteBoardOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void removeBoard()}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="small">{t('board.deleteConfirm')}</p>
      </Modal>

      <Modal
        open={boardSettingsOpen}
        onClose={() => setBoardSettingsOpen(false)}
        title={t('board.boardSettings')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBoardSettingsOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void saveBoardSettings()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="stack">
          <div>
            <label className="label" htmlFor="board-settings-name">
              {t('workspace.boardName')}
            </label>
            <input
              id="board-settings-name"
              className="input"
              value={settingsName}
              onChange={(event) => setSettingsName(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="board-settings-description">
              {t('workspace.description')}
            </label>
            <textarea
              id="board-settings-description"
              className="textarea"
              value={settingsDescription}
              onChange={(event) => setSettingsDescription(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="board-settings-visibility">
              {t('board.visibility')}
            </label>
            <select
              id="board-settings-visibility"
              className="select"
              value={settingsVisibility}
              onChange={(event) => setSettingsVisibility(event.target.value as BoardVisibility)}
              disabled={!canManageBoard}
            >
              <option value="private">{t('board.private')}</option>
              <option value="public">{t('board.public')}</option>
            </select>
            <p className="caption subtle" style={{ marginTop: 4 }}>
              {settingsVisibility === 'public' ? t('board.publicHint') : t('board.privateHint')}
            </p>
          </div>
          <div>
            <span className="label">{t('workspace.cover')}</span>
            <div className="row wrap">
              {LIST_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  onClick={() => setSettingsCover(color)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: color,
                    border:
                      settingsCover === color
                        ? '3px solid var(--color-text)'
                        : '2px solid var(--color-surface)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={shareOpen}
        onClose={() => {
          setShareOpen(false);
          setShareResult(null);
        }}
        title={t('board.share')}
        footer={
          <Button
            variant="ghost"
            onClick={() => {
              setShareOpen(false);
              setShareResult(null);
            }}
          >
            {t('common.close')}
          </Button>
        }
      >
        <div className="stack">
          <div className="spread">
            <span className="label">{t('board.visibility')}</span>
            <div className="row">
              <button
                type="button"
                className={cn('chip', board.visibility !== 'public' && 'active')}
                disabled={!canManageBoard}
                onClick={() => void changeVisibility('private')}
              >
                {t('board.private')}
              </button>
              <button
                type="button"
                className={cn('chip', board.visibility === 'public' && 'active')}
                disabled={!canManageBoard}
                onClick={() => void changeVisibility('public')}
              >
                {t('board.public')}
              </button>
            </div>
          </div>
          <p className="caption subtle">
            {board.visibility === 'public' ? t('board.publicHint') : t('board.privateHint')}
          </p>
          <div>
            <span className="label">{t('board.shareLink')}</span>
            {board.visibility === 'public' ? (
              <div className="row">
                <input
                  className="input"
                  readOnly
                  value={publicShareLink()}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button size="sm" icon="copy" onClick={() => void copyShareLink()}>
                  {t('common.copy')}
                </Button>
              </div>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                {privateLinks.map((link) => (
                  <div className="row" key={link.id}>
                    <input
                      className="input"
                      readOnly
                      value={link.url}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <Button size="sm" icon="copy" onClick={() => void copyShareLink(link.url)}>
                      {t('common.copy')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      aria-label={t('common.remove')}
                      onClick={() => void revokePrivateShareLink(link.id)}
                    />
                  </div>
                ))}
                <div className="row">
                  <Button size="sm" variant="ghost" onClick={() => void createPrivateShareLink()}>
                    {t('board.createShareLink')}
                  </Button>
                </div>
                <p className="caption subtle">{t('board.shareLinkHint')}</p>
              </div>
            )}
          </div>
          <hr className="divider" />
          <div>
            <span className="label">{t('board.sendLinkTo')}</span>
            <input
              className="input"
              placeholder="user@example.com, ..."
              value={shareEmails}
              onChange={(event) => setShareEmails(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void sendShareLinks();
              }}
            />
          </div>
          <div className="row">
            <select
              className="select"
              value={shareRole}
              onChange={(event) => setShareRole(event.target.value as 'viewer' | 'member')}
            >
              <option value="viewer">{t('board.canView')}</option>
              <option value="member">{t('board.canEdit')}</option>
            </select>
            <Button
              variant="primary"
              onClick={() => void sendShareLinks()}
              disabled={!shareEmails.trim()}
            >
              {t('common.send')}
            </Button>
          </div>
          {shareResult ? (
            <div className="alert info" style={{ display: 'grid', gap: 6 }}>
              {shareResult.results.map((row) => (
                <div className="spread small" key={row.email}>
                  <span className="truncate">{row.email}</span>
                  <span
                    className={cn(
                      'badge',
                      row.status === 'sent' || row.status === 'updated' ? 'success' : 'warning',
                    )}
                  >
                    {t(`board.shareStatus.${row.status}`)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {canManageBoard ? (
            <>
              <hr className="divider" />
              <div className="spread">
                <span className="label">{t('board.accessRequests')}</span>
                <span className="badge">{accessRequests.length}</span>
              </div>
              {accessRequests.length === 0 ? (
                <p className="caption subtle">{t('board.noAccessRequests')}</p>
              ) : (
                accessRequests.map((request) => (
                  <div className="member-row" key={request.id}>
                    <Avatar name={request.display_name} src={request.avatar_url} size="sm" />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="strong small truncate">{request.display_name}</div>
                      <div className="caption subtle truncate">{request.email}</div>
                      {request.message ? (
                        <div className="caption" style={{ marginTop: 2 }}>
                          {request.message}
                        </div>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={requestBusy === request.id}
                      onClick={() => void approveAccessRequest(request.id, 'member')}
                    >
                      {t('board.approve')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={requestBusy === request.id}
                      onClick={() => void rejectAccessRequest(request.id)}
                    >
                      {t('board.reject')}
                    </Button>
                  </div>
                ))
              )}
            </>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={saveViewOpen}
        onClose={() => setSaveViewOpen(false)}
        title={t('filters.saveView')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveViewOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void saveView()} disabled={!viewName.trim()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <label className="label" htmlFor="view-name">
          {t('filters.viewName')}
        </label>
        <input
          id="view-name"
          className="input"
          data-autofocus
          value={viewName}
          onChange={(event) => setViewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void saveView();
          }}
        />
      </Modal>
    </div>
  );
}

function groupIds(
  rows: Array<Record<string, string>>,
  key: string,
  value: string,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const id = row[key];
    const item = row[value];
    if (!id || !item) continue;
    const list = map.get(id) ?? [];
    list.push(item);
    map.set(id, list);
  }
  return map;
}

function Presence({ users }: { users: PresenceUser[] }) {
  const { t } = useTranslation();
  return (
    <span className="avatar-stack" title={t('board.presence', { count: users.length })}>
      {users.slice(0, 4).map((user) => (
        <Avatar key={user.id} name={user.name} src={user.avatar_url} size="sm" />
      ))}
      {users.length > 4 ? <span className="avatar sm">+{users.length - 4}</span> : null}
    </span>
  );
}

function SortableCard(props: {
  card: Card;
  labels: CardLabel[];
  assignees: string[];
  members: import('@kanban/shared').Member[];
  checklist: { done: number; total: number };
  commentCount: number;
  attachmentCount: number;
  selected?: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.card.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <CardTile {...props} dragging={isDragging} />
    </div>
  );
}

function SortableColumn({
  list,
  collapsed,
  count,
  canWrite,
  children,
  onCollapse,
  onRename,
  onWip,
  onColor,
  onArchive,
}: {
  list: BoardList;
  collapsed: boolean;
  count: number;
  canWrite: boolean;
  children: React.ReactNode;
  onCollapse: () => void;
  onRename: () => void;
  onWip: () => void;
  onColor: () => void;
  onArchive: () => void;
}) {
  const { t } = useTranslation();
  const { setNodeRef, attributes, listeners, transform, transition, isDragging, isOver } =
    useSortable({
      id: `list:${list.id}`,
      data: { type: 'list' },
    });
  const over = list.wip_limit !== null && count > list.wip_limit;
  return (
    <div
      ref={setNodeRef}
      className={cn('column', collapsed && 'collapsed', isOver && 'drop-target')}
      data-list-id={list.id}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        borderTop: list.color ? `3px solid ${list.color}` : undefined,
      }}
    >
      <div className="column-header">
        <button
          type="button"
          className="drag-handle"
          aria-label={t('common.move')}
          {...attributes}
          {...listeners}
        >
          <Icon name="drag" size={14} />
        </button>
        <span className="column-title truncate" onDoubleClick={canWrite ? onRename : undefined}>
          {list.name}
        </span>
        <span
          className={cn('column-count', over && 'over')}
          title={over ? t('board.wipWarning') : undefined}
        >
          {count}
          {list.wip_limit !== null ? ` / ${list.wip_limit}` : ''} {over ? '⚠' : ''}
        </span>
        {canWrite ? (
          <div className="column-menu">
            <Menu
              trigger={(props) => (
                <button
                  type="button"
                  className="btn ghost sm"
                  aria-label={t('common.more')}
                  {...props}
                >
                  <Icon name="more" size={15} />
                </button>
              )}
            >
              <MenuItem icon="edit" onClick={onRename}>
                {t('board.rename')}
              </MenuItem>
              <MenuItem icon="flag" onClick={onWip}>
                {t('board.wipLimit')}
              </MenuItem>
              <MenuItem icon="palette" onClick={onColor}>
                {t('workspace.cover')}
              </MenuItem>
              <MenuItem icon={collapsed ? 'chevron-right' : 'chevron-left'} onClick={onCollapse}>
                {collapsed ? t('board.expand') : t('board.collapse')}
              </MenuItem>
              <div className="menu-separator" />
              <MenuItem icon="archive" danger onClick={onArchive}>
                {t('board.deleteList')}
              </MenuItem>
            </Menu>
          </div>
        ) : null}
      </div>
      <div className="column-body">{children}</div>
    </div>
  );
}

function FilterPanel({
  filters,
  setFilters,
  labels,
  members,
  views,
  onReset,
  onApplyView,
  onSaveView,
}: {
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  labels: CardLabel[];
  members: import('@kanban/shared').Member[];
  views: Array<{ id: string; name: string; filters: string }>;
  onReset: () => void;
  onApplyView: (value: string) => void;
  onSaveView: () => void;
}) {
  const { t } = useTranslation();
  const toggle = (group: 'assignees' | 'labels' | 'priorities', value: string) => {
    const current = filters[group] as string[];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    setFilters({ ...filters, [group]: next } as FilterState);
  };
  return (
    <div className="filter-bar" role="region" aria-label={t('filters.title')}>
      <input
        className="input query"
        placeholder={t('board.searchInBoard')}
        value={filters.q}
        onChange={(event) => setFilters({ ...filters, q: event.target.value })}
        aria-label={t('filters.text')}
      />
      <button
        type="button"
        className={cn('chip', (filters.mine || filters.assignees.includes('me')) && 'active')}
        onClick={() =>
          setFilters({
            ...filters,
            mine: !filters.mine,
            assignees: filters.assignees.filter((id) => id !== 'me'),
          })
        }
      >
        <Icon name="user" size={12} /> {t('filters.onlyMine')}
      </button>
      <button
        type="button"
        className={cn('chip', filters.unassigned && 'active')}
        onClick={() => setFilters({ ...filters, unassigned: !filters.unassigned })}
      >
        <Icon name="users" size={12} /> {t('filters.unassigned')}
      </button>
      {members.map((member) => (
        <button
          key={member.user_id}
          type="button"
          className={cn('chip', filters.assignees.includes(member.user_id) && 'active')}
          onClick={() => toggle('assignees', member.user_id)}
        >
          <Avatar name={member.display_name} src={member.avatar_url} size="sm" />
          {member.display_name}
        </button>
      ))}
      {labels.map((label) => (
        <button
          key={label.id}
          type="button"
          className={cn('chip', filters.labels.includes(label.id) && 'active')}
          onClick={() => toggle('labels', label.id)}
        >
          <span className="dot" style={{ background: label.color }} />
          {label.name}
        </button>
      ))}
      {(['high', 'urgent'] as const).map((priority) => (
        <button
          key={priority}
          type="button"
          className={cn('chip', filters.priorities.includes(priority) && 'active')}
          onClick={() => toggle('priorities', priority)}
        >
          <span className="dot" style={{ background: PRIORITY_COLORS[priority] }} />
          {t(priority === 'high' ? 'card.priorityHigh' : 'card.priorityUrgent')}
        </button>
      ))}
      <select
        className="select"
        style={{ width: 150, minHeight: 28, padding: '2px 26px 2px 8px' }}
        value={filters.due ?? ''}
        onChange={(event) =>
          setFilters({ ...filters, due: (event.target.value || null) as FilterState['due'] })
        }
        aria-label={t('filters.due')}
      >
        <option value="">{t('filters.due')}</option>
        <option value="overdue">{t('filters.overdue')}</option>
        <option value="today">{t('filters.today')}</option>
        <option value="week">{t('filters.week')}</option>
        <option value="none">{t('filters.noDue')}</option>
      </select>
      <label className="checkbox small">
        <input
          type="checkbox"
          checked={filters.archived}
          onChange={(event) => setFilters({ ...filters, archived: event.target.checked })}
        />
        {t('filters.archived')}
      </label>
      <label className="checkbox small">
        <input
          type="checkbox"
          checked={filters.hideEmpty}
          onChange={(event) => setFilters({ ...filters, hideEmpty: event.target.checked })}
        />
        {t('filters.hideEmpty')}
      </label>
      <span className="grow" />
      {views.length > 0 ? (
        <select
          className="select"
          style={{ width: 170, minHeight: 28, padding: '2px 26px 2px 8px' }}
          value=""
          onChange={(event) => event.target.value && onApplyView(event.target.value)}
          aria-label={t('filters.savedViews')}
        >
          <option value="">{t('filters.savedViews')}</option>
          {views.map((view) => (
            <option key={view.id} value={view.filters}>
              {view.name}
            </option>
          ))}
        </select>
      ) : null}
      <Button size="sm" icon="plus" onClick={onSaveView}>
        {t('filters.saveView')}
      </Button>
      <Button size="sm" variant="ghost" onClick={onReset}>
        {t('common.reset')}
      </Button>
    </div>
  );
}

function ListTable({
  lists,
  cards,
  labelsById,
  labelIdsByCard,
  assigneesByCard,
  members,
  checklistStats,
  onOpen,
}: {
  lists: BoardList[];
  cards: Card[];
  labelsById: Map<string, CardLabel>;
  labelIdsByCard: Map<string, string[]>;
  assigneesByCard: Map<string, string[]>;
  members: import('@kanban/shared').Member[];
  checklistStats: Map<string, { done: number; total: number }>;
  onOpen: (cardId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const ordered = [...cards].sort((a, b) => {
    const listA = lists.findIndex((list) => list.id === a.list_id);
    const listB = lists.findIndex((list) => list.id === b.list_id);
    if (listA !== listB) return listA - listB;
    return a.position.localeCompare(b.position);
  });
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{t('board.list')}</th>
            <th>{t('card.title')}</th>
            <th>{t('card.assignees')}</th>
            <th>{t('card.labels')}</th>
            <th>{t('card.dueDate')}</th>
            <th>{t('card.priority')}</th>
            <th>{t('card.checklist')}</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((card) => {
            const urgency = dueUrgency(card.due_date, card.due_done === 1);
            return (
              <tr key={card.id} onClick={() => onOpen(card.id)} style={{ cursor: 'pointer' }}>
                <td className="small muted">
                  {lists.find((list) => list.id === card.list_id)?.name}
                </td>
                <td>
                  <span className="strong">{card.title}</span>
                </td>
                <td>
                  <span className="avatar-stack">
                    {(assigneesByCard.get(card.id) ?? []).map((id) => {
                      const member = members.find((item) => item.user_id === id);
                      return member ? (
                        <Avatar
                          key={id}
                          name={member.display_name}
                          src={member.avatar_url}
                          size="sm"
                        />
                      ) : null;
                    })}
                  </span>
                </td>
                <td>
                  <span className="row wrap" style={{ gap: 3 }}>
                    {(labelIdsByCard.get(card.id) ?? []).map((id) => {
                      const label = labelsById.get(id);
                      return label ? (
                        <span key={id} className="label-pill" style={{ background: label.color }}>
                          {label.name}
                        </span>
                      ) : null;
                    })}
                  </span>
                </td>
                <td
                  className={cn(
                    'small',
                    urgency === 'overdue' && 'due-overdue',
                    urgency === 'today' && 'due-today',
                  )}
                >
                  {card.due_date ? formatDue(card.due_date, i18n.language) : '—'}
                </td>
                <td>
                  <span className="row" style={{ gap: 4 }}>
                    <span
                      className="dot"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: PRIORITY_COLORS[card.priority],
                      }}
                    />
                    {t(`card.priority${card.priority[0]!.toUpperCase()}${card.priority.slice(1)}`)}
                  </span>
                </td>
                <td className="small">
                  {checklistStats.get(card.id)
                    ? `${checklistStats.get(card.id)!.done}/${checklistStats.get(card.id)!.total}`
                    : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
