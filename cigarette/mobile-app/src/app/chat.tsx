import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  Modal,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/contexts/AuthContext";
import { useAlert } from "@/contexts/AlertContext";
import { useAppSounds } from "@/hooks/useAppSounds";
import { api } from "@/lib/api";
import type { APIResponse } from "@/types";
import * as Clipboard from "expo-clipboard";

interface ChatUser {
  id: string;
  displayName: string;
  role: string;
  smokingType: "CIGARETTE" | "POD";
}

interface ChatMessage {
  id: string;
  content: string;
  alias?: string | null;
  isDeleted: boolean;
  isEdited: boolean;
  createdAt: string;
  userId: string;
  user: ChatUser;
}

export default function ChatScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { playClick, playNav, playCorrect } = useAppSounds();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Alias Modal
  const [showAliasModal, setShowAliasModal] = useState(true);
  const [aliasInput, setAliasInput] = useState("");
  const [confirmedAlias, setConfirmedAlias] = useState("");
  const [defaultAlias, setDefaultAlias] = useState("");

  // Hidden messages
  const [hiddenMessages, setHiddenMessages] = useState<Set<string>>(new Set());

  // Last read tracking
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(null);
  const [lastReadIndex, setLastReadIndex] = useState<number>(-1);

  // Context Menu
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);

  // Edit Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editInput, setEditInput] = useState("");

  const flatListRef = useRef<FlatList>(null);

  // Load initial settings
  useEffect(() => {
    async function loadInitial() {
      if (!user) return;
      try {
        // Fetch rank
        const rankRes = await api.getRank(user.id);
        const rank = rankRes.data?.rank || 1;
        const defAlias = `นิรนาม${rank}`;
        setDefaultAlias(defAlias);

        // Load stored alias
        const storedAlias = await AsyncStorage.getItem("@ciga_chat_alias");
        setAliasInput(storedAlias || defAlias);

        // Load hidden messages
        const storedHidden = await AsyncStorage.getItem("@ciga_hidden_messages");
        if (storedHidden) {
          setHiddenMessages(new Set(JSON.parse(storedHidden)));
        }

        // Load last read id
        const storedReadId = await AsyncStorage.getItem("@ciga_last_read_message_id");
        if (storedReadId) {
          setLastReadMessageId(storedReadId);
        }
      } catch (err) {
        console.error("Init error", err);
      }
    }
    loadInitial();
  }, [user]);

  const fetchMessages = async (isLoadMore = false) => {
    if (!isLoadMore) setLoading(true);
    else setFetchingMore(true);

    try {
      const cursor = isLoadMore && messages.length > 0 ? messages[messages.length - 1].id : undefined;
      const response = await api.getChatMessages(cursor, 30) as APIResponse<ChatMessage[]>;
      
      if (response.success && response.data) {
        // Server returns newest first in db, but API returns reverse(). Wait, our API returning reverse() means oldest first.
        // We modified API to return reverse(). So it's oldest first.
        // We want newest first if we use inverted={true}, but since we didn't change the API reverse logic in the fix, it returns oldest first.
        // Let's reverse it to be newest first for inverted flatlist
        const fetchedMessages = response.data.reverse();

        if (fetchedMessages.length < 30) {
          setHasMore(false);
        }

        if (isLoadMore) {
          setMessages(prev => [...prev, ...fetchedMessages]);
        } else {
          setMessages(fetchedMessages);
          
          // Mark newest message as read if any
          if (fetchedMessages.length > 0) {
            const newestId = fetchedMessages[0].id;
            AsyncStorage.setItem("@ciga_last_read_message_id", newestId);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch messages", err);
    } finally {
      setLoading(false);
      setFetchingMore(false);
    }
  };

  // Initial fetch when alias is confirmed
  useEffect(() => {
    if (!showAliasModal) {
      fetchMessages();
    }
  }, [showAliasModal]);

  // Polling
  useEffect(() => {
    if (showAliasModal) return;
    const interval = setInterval(async () => {
      try {
        const response = await api.getChatMessages(undefined, 30) as APIResponse<ChatMessage[]>;
        if (response.success && response.data) {
          const fetchedMessages = response.data.reverse();
          setMessages(prev => {
            // Simple merge to avoid duplicates and update edited/deleted
            const newMap = new Map(fetchedMessages.map(m => [m.id, m]));
            prev.forEach(m => {
              if (!newMap.has(m.id)) newMap.set(m.id, m);
            });
            return Array.from(newMap.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          });
        }
      } catch (err) { }
    }, 5000);
    return () => clearInterval(interval);
  }, [showAliasModal]);


  const handleConfirmAlias = async () => {
    playClick();
    const finalAlias = aliasInput.trim() || defaultAlias;
    setConfirmedAlias(finalAlias);
    await AsyncStorage.setItem("@ciga_chat_alias", finalAlias);
    setShowAliasModal(false);
  };

  const handleResetAlias = () => {
    playClick();
    setAliasInput(defaultAlias);
  };

  const handleSend = async () => {
    if (!inputText.trim() || !user) return;
    setSending(true);
    try {
      const content = inputText.trim();
      setInputText(""); 
      const response = await api.postChatMessage({ userId: user.id, content, alias: confirmedAlias }) as APIResponse<ChatMessage>;
      if (response.success && response.data) {
        setMessages((prev) => [response.data!, ...prev]);
        AsyncStorage.setItem("@ciga_last_read_message_id", response.data!.id);
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    } catch (err) {
      console.error("Failed to send message", err);
    } finally {
      setSending(false);
    }
  };

  const handleLongPress = (item: ChatMessage) => {
    setSelectedMessage(item);
  };

  const handleHideMessage = async () => {
    if (!selectedMessage) return;
    const newHidden = new Set(hiddenMessages);
    newHidden.add(selectedMessage.id);
    setHiddenMessages(newHidden);
    await AsyncStorage.setItem("@ciga_hidden_messages", JSON.stringify(Array.from(newHidden)));
    setSelectedMessage(null);
  };

  const handleCopyMessage = async () => {
    if (!selectedMessage || selectedMessage.isDeleted) return;
    await Clipboard.setStringAsync(selectedMessage.content);
    setSelectedMessage(null);
  };

  const handleUnsend = async () => {
    if (!selectedMessage || !user) return;
    try {
      await api.deleteChatMessage(selectedMessage.id, user.id);
      setMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, isDeleted: true, content: "" } : m));
    } catch (err) {
      showAlert({ title: "ข้อผิดพลาด", message: "ไม่สามารถยกเลิกข้อความได้", type: "error" });
    }
    setSelectedMessage(null);
  };

  const handleEditSubmit = async () => {
    if (!selectedMessage || !user || !editInput.trim()) return;
    try {
      await api.editChatMessage(selectedMessage.id, { userId: user.id, content: editInput.trim() });
      setMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, isEdited: true, content: editInput.trim() } : m));
      setEditModalVisible(false);
    } catch (err) {
      showAlert({ title: "ข้อผิดพลาด", message: "ไม่สามารถแก้ไขข้อความได้", type: "error" });
    }
  };

  const renderItem = ({ item, index }: { item: ChatMessage, index: number }) => {
    if (hiddenMessages.has(item.id)) return null;

    const isMe = user?.id === item.userId;
    const showSeparator = lastReadMessageId === item.id;
    const displayName = item.alias || item.user.displayName;

    const itemDate = new Date(item.createdAt).toLocaleDateString("th-TH", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "2-digit"
    });

    let showDateSeparator = false;
    if (index === messages.length - 1) {
      showDateSeparator = true;
    } else {
      const olderItem = messages[index + 1];
      if (olderItem) {
        const olderItemDate = new Date(olderItem.createdAt).toLocaleDateString("th-TH", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "2-digit"
        });
        if (itemDate !== olderItemDate) {
          showDateSeparator = true;
        }
      }
    }

    return (
      <View>
        {showDateSeparator && (
          <View style={styles.dateSeparatorContainer}>
            <View style={styles.dateSeparatorLine} />
            <Text style={styles.dateSeparatorText}>{itemDate}</Text>
            <View style={styles.dateSeparatorLine} />
          </View>
        )}
        {showSeparator && (
          <View style={styles.separatorContainer}>
            <View style={styles.separatorLine} />
            <Text style={styles.separatorText}>ข้อความที่ยังไม่ได้อ่าน</Text>
            <View style={styles.separatorLine} />
          </View>
        )}
        <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}>
          {!isMe && (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={isMe ? styles.messageContainerMe : styles.messageContainerOther}>
            {!isMe && (
              <Text style={styles.senderName}>
                {displayName} {item.user.smokingType === "POD" ? "💨" : "🚬"}
              </Text>
            )}
            
            <Pressable 
              onLongPress={() => handleLongPress(item)}
              delayLongPress={200}
              style={({ pressed }) => [
                styles.bubble, 
                isMe ? styles.bubbleMe : styles.bubbleOther,
                item.isDeleted && styles.bubbleDeleted,
                pressed && { opacity: 0.8 }
              ]}
            >
              {item.isDeleted ? (
                <Text style={styles.messageDeletedText}>ข้อความนี้ถูกยกเลิกแล้ว</Text>
              ) : (
                <Text style={[styles.messageText, isMe ? styles.messageTextMe : styles.messageTextOther]}>
                  {item.content}
                </Text>
              )}
            </Pressable>
            
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
              {item.isEdited && !item.isDeleted && <Text style={styles.editedText}>(แก้ไขแล้ว)</Text>}
              <Text style={styles.timestamp}>
                {new Date(item.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => { playNav(); router.replace('/(tabs)'); }} style={styles.backButton}>
            <Feather name="chevron-left" size={28} color="#1e293b" />
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>OpenChat</Text>
            <Text style={styles.headerSubtitle}>แลกเปลี่ยนมุมมองและให้กำลังใจ</Text>
          </View>
        </View>

        {/* Alias Modal */}
        <Modal visible={showAliasModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.aliasModal}>
              <Text style={styles.aliasModalTitle}>ตั้งชื่อสำหรับแชท</Text>
              <Text style={styles.aliasModalSubtitle}>ชื่อนี้จะแสดงให้ทุกคนเห็นในแชทนี้</Text>
              <TextInput
                style={styles.aliasInput}
                value={aliasInput}
                onChangeText={setAliasInput}
                placeholder={defaultAlias}
                placeholderTextColor="#94a3b8"
                maxLength={30}
              />
              <View style={styles.aliasButtons}>
                <Pressable style={styles.aliasResetBtn} onPress={handleResetAlias}>
                  <Text style={styles.aliasResetText}>รีเซ็ต</Text>
                </Pressable>
                <Pressable style={styles.aliasConfirmBtn} onPress={handleConfirmAlias}>
                  <Text style={styles.aliasConfirmText}>ยืนยัน</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Action Menu Modal */}
        <Modal visible={!!selectedMessage && !editModalVisible} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => setSelectedMessage(null)}>
            <View style={styles.actionModal}>
              {!selectedMessage?.isDeleted && (
                <>
                  <Pressable style={styles.actionBtn} onPress={handleCopyMessage}>
                    <Text style={styles.actionText}>คัดลอกข้อความ</Text>
                  </Pressable>
                  <View style={styles.actionDivider} />
                </>
              )}
              
              <Pressable style={styles.actionBtn} onPress={handleHideMessage}>
                <Text style={styles.actionText}>ลบข้อความ</Text>
              </Pressable>
              
              {selectedMessage?.userId === user?.id && !selectedMessage?.isDeleted && (
                <>
                  <View style={styles.actionDivider} />
                  <Pressable style={styles.actionBtn} onPress={() => {
                    setEditInput(selectedMessage?.content || "");
                    setEditModalVisible(true);
                  }}>
                    <Text style={styles.actionText}>แก้ไขข้อความ</Text>
                  </Pressable>
                  <View style={styles.actionDivider} />
                  <Pressable style={styles.actionBtn} onPress={handleUnsend}>
                    <Text style={[styles.actionText, { color: "#ef4444" }]}>ยกเลิกข้อความ</Text>
                  </Pressable>
                </>
              )}
            </View>
          </Pressable>
        </Modal>

        {/* Edit Modal */}
        <Modal visible={editModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.aliasModal}>
              <Text style={styles.aliasModalTitle}>แก้ไขข้อความ</Text>
              <TextInput
                style={styles.aliasInput}
                value={editInput}
                onChangeText={setEditInput}
                multiline
              />
              <View style={styles.aliasButtons}>
                <Pressable style={styles.aliasResetBtn} onPress={() => { setEditModalVisible(false); setSelectedMessage(null); }}>
                  <Text style={styles.aliasResetText}>ยกเลิก</Text>
                </Pressable>
                <Pressable style={styles.aliasConfirmBtn} onPress={handleEditSubmit}>
                  <Text style={styles.aliasConfirmText}>บันทึก</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Chat Messages */}
        <View style={styles.chatArea}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#38bdf8" />
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              inverted
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              onEndReached={() => {
                if (hasMore && !fetchingMore) fetchMessages(true);
              }}
              onEndReachedThreshold={0.5}
              showsVerticalScrollIndicator={false}
              ListFooterComponent={fetchingMore ? <ActivityIndicator size="small" color="#38bdf8" style={{ margin: 16 }} /> : null}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Feather name="message-circle" size={48} color="#e2e8f0" />
                  <Text style={styles.emptyText}>ยังไม่มีข้อความ เริ่มทักทายได้เลย!</Text>
                </View>
              }
            />
          )}
        </View>

        {/* Input Area */}
        <View style={styles.inputArea}>
          <TextInput
            style={styles.textInput}
            placeholder="พิมพ์ข้อความ..."
            placeholderTextColor="#64748b"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            editable={!showAliasModal}
          />
          <Pressable
            style={[styles.sendButton, (!inputText.trim() || sending || showAliasModal) && styles.sendButtonDisabled]}
            onPress={() => { playClick(); handleSend(); }}
            disabled={!inputText.trim() || sending || showAliasModal}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="send" size={20} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f0fdfa" },
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)", backgroundColor: "#ffffff",
  },
  backButton: { padding: 8, marginRight: 8 },
  headerTitleContainer: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1e293b" },
  headerSubtitle: { fontSize: 12, color: "#475569", marginTop: 2 },
  
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 20
  },
  aliasModal: {
    width: "100%", backgroundColor: "#fff", borderRadius: 16, padding: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8
  },
  aliasModalTitle: { fontSize: 18, fontWeight: "700", color: "#1e293b", marginBottom: 8, textAlign: "center" },
  aliasModalSubtitle: { fontSize: 14, color: "#64748b", marginBottom: 20, textAlign: "center" },
  aliasInput: {
    backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, padding: 16, fontSize: 16, color: "#1e293b", marginBottom: 24
  },
  aliasButtons: { flexDirection: "row", gap: 12 },
  aliasResetBtn: { flex: 1, backgroundColor: "#f1f5f9", padding: 14, borderRadius: 12, alignItems: "center" },
  aliasResetText: { color: "#475569", fontWeight: "600", fontSize: 16 },
  aliasConfirmBtn: { flex: 1, backgroundColor: "#38bdf8", padding: 14, borderRadius: 12, alignItems: "center" },
  aliasConfirmText: { color: "#ffffff", fontWeight: "600", fontSize: 16 },

  actionModal: {
    backgroundColor: "#fff", borderRadius: 16, width: 250, overflow: "hidden",
  },
  actionBtn: { padding: 16, alignItems: "center" },
  actionText: { fontSize: 16, color: "#1e293b", fontWeight: "500" },
  actionDivider: { height: 1, backgroundColor: "#f1f5f9" },

  chatArea: { flex: 1, backgroundColor: "#f0fdfa" },
  listContent: { padding: 16, gap: 16 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", marginTop: 100 },
  emptyText: { color: "#475569", marginTop: 12, fontSize: 14 },
  
  separatorContainer: { flexDirection: "row", alignItems: "center", marginVertical: 16 },
  separatorLine: { flex: 1, height: 1, backgroundColor: "#ef4444", opacity: 0.5 },
  separatorText: { marginHorizontal: 12, color: "#ef4444", fontSize: 12, fontWeight: "600" },

  dateSeparatorContainer: { flexDirection: "row", alignItems: "center", marginVertical: 24 },
  dateSeparatorLine: { flex: 1, height: 1, backgroundColor: "#e2e8f0" },
  dateSeparatorText: { marginHorizontal: 12, color: "#64748b", fontSize: 12, fontWeight: "500" },

  messageRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 4 },
  messageRowMe: { justifyContent: "flex-end" },
  messageRowOther: { justifyContent: "flex-start" },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#e2e8f0", justifyContent: "center", alignItems: "center", marginRight: 8 },
  avatarText: { color: "#1e293b", fontSize: 14, fontWeight: "700" },
  messageContainerMe: { alignItems: "flex-end", maxWidth: "80%" },
  messageContainerOther: { alignItems: "flex-start", maxWidth: "80%" },
  senderName: { fontSize: 12, color: "#475569", marginBottom: 4, marginLeft: 4 },
  bubble: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  bubbleMe: { backgroundColor: "#38bdf8", borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: "#ffffff", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  bubbleDeleted: { backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed" },
  messageText: { fontSize: 15, lineHeight: 22 },
  messageTextMe: { color: "#ffffff" },
  messageTextOther: { color: "#1e293b" },
  messageDeletedText: { fontSize: 15, fontStyle: "italic", color: "#94a3b8" },
  editedText: { fontSize: 10, color: "#94a3b8", marginTop: 4, marginHorizontal: 4 },
  timestamp: { fontSize: 10, color: "#64748b", marginTop: 4, marginHorizontal: 4 },

  inputArea: {
    flexDirection: "row", padding: 12, paddingBottom: Platform.OS === "ios" ? 24 : 12,
    backgroundColor: "#ffffff", borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.08)", alignItems: "flex-end"
  },
  textInput: {
    flex: 1, backgroundColor: "#f0fdfa", color: "#1e293b", borderRadius: 20, paddingHorizontal: 16,
    paddingTop: 12, paddingBottom: 12, minHeight: 44, maxHeight: 120, fontSize: 15, marginRight: 12,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.08)"
  },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#38bdf8", justifyContent: "center", alignItems: "center" },
  sendButtonDisabled: { backgroundColor: "#94a3b8", opacity: 0.5 },
});
