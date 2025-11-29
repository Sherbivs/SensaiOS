package com.infinitygauntlet.simulation.presentation.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.infinitygauntlet.simulation.domain.models.Channel
import com.infinitygauntlet.simulation.domain.models.ChatMessage
import com.infinitygauntlet.simulation.ui.components.*
import com.infinitygauntlet.simulation.ui.theme.Spacing
import kotlinx.coroutines.launch

/**
 * Chat Screen - Discord-like Chat Interface
 * 
 * Week 4: Phase 4.1 - UI Screens
 * 
 * Features:
 * - Channel list sidebar (240dp width)
 * - Message list with scrolling
 * - Message input bar at bottom
 * - Search functionality
 * - Real-time typing indicators
 * - Message reactions and editing
 * - Unread message tracking
 * 
 * Architecture:
 * - Uses ChatViewModel for state management
 * - Collects StateFlow for reactive UI
 * - Handles one-time events via SharedFlow
 * - Integrates Week 3 component library
 */
@Composable
fun ChatScreen(
    viewModel: ChatViewModel = hiltViewModel()
) {
    // Collect UI state
    val uiState by viewModel.uiState.collectAsState()
    
    // Collect one-time events
    val events by viewModel.events.collectAsState(initial = null)
    
    // Snackbar host for messages
    val snackbarHostState = remember { SnackbarHostState() }
    
    // Handle one-time events
    LaunchedEffect(events) {
        events?.let { event ->
            when (event) {
                is ChatUiEvent.Error -> {
                    snackbarHostState.showSnackbar(
                        message = event.message,
                        duration = SnackbarDuration.Short
                    )
                }
                is ChatUiEvent.ShowMessage -> {
                    snackbarHostState.showSnackbar(
                        message = event.message,
                        duration = SnackbarDuration.Short
                    )
                }
                is ChatUiEvent.MessageSent -> {
                    // Auto-scroll to bottom handled by LazyColumn
                }
                is ChatUiEvent.ChannelSwitched -> {
                    snackbarHostState.showSnackbar(
                        message = "Switched to ${event.channelName}",
                        duration = SnackbarDuration.Short
                    )
                }
                else -> {
                    // Other events (MessageReceived, BotTypingStarted, etc.)
                }
            }
        }
    }
    
    Scaffold(
        topBar = {
            ChatTopBar(
                currentChannel = uiState.currentChannel,
                unreadCount = uiState.totalUnreadCount,
                onSearchClick = { /* TODO: Implement search */ },
                onClearMessages = viewModel::clearMessages
            )
        },
        snackbarHost = {
            SnackbarHost(hostState = snackbarHostState)
        }
    ) { paddingValues ->
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Left sidebar: Channel list
            ChannelListSidebar(
                channels = uiState.channels,
                currentChannelId = uiState.currentChannel?.id,
                onChannelClick = { channelId ->
                    viewModel.switchChannel(channelId.toLongOrNull() ?: 0)
                },
                modifier = Modifier.width(240.dp)
            )
            
            // Right content: Messages + Input
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
            ) {
                // Message list
                MessageList(
                    messages = uiState.messages,
                    isLoading = uiState.isLoading,
                    typingUsers = uiState.typingUsers,
                    onReactionClick = { messageId, emoji ->
                        viewModel.addReaction(messageId, emoji)
                    },
                    onEditClick = { messageId ->
                        // TODO: Show edit dialog
                    },
                    onDeleteClick = { messageId ->
                        viewModel.deleteMessage(messageId)
                    },
                    modifier = Modifier.weight(1f)
                )
                
                // Message input bar
                MessageInputBar(
                    isSendingMessage = uiState.isSendingMessage,
                    onSendMessage = { content ->
                        viewModel.sendMessage(content)
                    },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

/**
 * Top App Bar for Chat Screen
 */
@Composable
private fun ChatTopBar(
    currentChannel: Channel?,
    unreadCount: Int,
    onSearchClick: () -> Unit,
    onClearMessages: () -> Unit
) {
    SmallTopBar(
        title = currentChannel?.name ?: "Chat",
        navigationIcon = AppIcons.Menu,
        onNavigationClick = { /* TODO: Open drawer */ },
        actions = {
            // Unread badge
            if (unreadCount > 0) {
                BadgedContent(
                    badge = {
                        NotificationBadge(count = unreadCount)
                    }
                ) {
                    IconActionButton(
                        icon = AppIcons.Notifications,
                        contentDescription = "Unread messages",
                        onClick = { /* TODO: Show unread */ }
                    )
                }
            }
            
            // Search button
            IconActionButton(
                icon = AppIcons.Search,
                contentDescription = "Search messages",
                onClick = onSearchClick
            )
            
            // More options menu
            var showMenu by remember { mutableStateOf(false) }
            Box {
                IconActionButton(
                    icon = AppIcons.MoreVert,
                    contentDescription = "More options",
                    onClick = { showMenu = true }
                )
                
                DropdownMenu(
                    expanded = showMenu,
                    onDismissRequest = { showMenu = false }
                ) {
                    DropdownMenuItem(
                        text = { Text("Clear messages") },
                        onClick = {
                            onClearMessages()
                            showMenu = false
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("Channel info") },
                        onClick = {
                            // TODO: Show channel info
                            showMenu = false
                        }
                    )
                }
            }
        }
    )
}

/**
 * Channel List Sidebar
 */
@Composable
private fun ChannelListSidebar(
    channels: List<Channel>,
    currentChannelId: String?,
    onChannelClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxHeight(),
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
        Column {
            // Section header
            SectionHeader(
                title = "Channels",
                modifier = Modifier.padding(Spacing.Medium)
            )
            
            // Channel list
            if (channels.isEmpty()) {
                EmptyStateWithAction(
                    title = "No Channels",
                    message = "Create a channel to start chatting",
                    actionText = "Create Channel",
                    onAction = { /* TODO: Create channel */ },
                    icon = AppIcons.Add,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(Spacing.Medium)
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(vertical = Spacing.Small)
                ) {
                    items(channels) { channel ->
                        ChannelListItem(
                            channel = channel,
                            isSelected = channel.id == currentChannelId,
                            onClick = { onChannelClick(channel.id) }
                        )
                    }
                }
            }
        }
    }
}

/**
 * Channel List Item
 */
@Composable
private fun ChannelListItem(
    channel: Channel,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val backgroundColor = if (isSelected) {
        MaterialTheme.colorScheme.primaryContainer
    } else {
        MaterialTheme.colorScheme.surfaceVariant
    }
    
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        color = backgroundColor
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.Medium),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = "# ${channel.name}",
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                
                if (!channel.description.isNullOrEmpty()) {
                    Text(
                        text = channel.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            
            // Unread badge
            if (channel.hasUnreadMessages) {
                NotificationBadge(count = channel.unreadCount)
            }
        }
    }
}

/**
 * Message List with infinite scroll
 */
@Composable
private fun MessageList(
    messages: List<ChatMessage>,
    isLoading: Boolean,
    typingUsers: List<String>,
    onReactionClick: (Long, String) -> Unit,
    onEditClick: (Long) -> Unit,
    onDeleteClick: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    val listState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()
    
    // Auto-scroll to bottom when new messages arrive
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            coroutineScope.launch {
                listState.animateScrollToItem(messages.size - 1)
            }
        }
    }
    
    Box(modifier = modifier.fillMaxSize()) {
        if (isLoading && messages.isEmpty()) {
            // Loading state - indeterminate progress
            Column(
                modifier = Modifier.align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(Spacing.Small)
            ) {
                CircularProgressIndicator()
                Text(
                    text = "Loading messages...",
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        } else if (messages.isEmpty()) {
            // Empty state
            EmptyStateWithAction(
                title = "No Messages",
                message = "Start the conversation by sending a message",
                actionText = "Send Message",
                onAction = { /* Focus input */ },
                icon = AppIcons.Message,
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(Spacing.Large)
            )
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(Spacing.Medium),
                verticalArrangement = Arrangement.spacedBy(Spacing.Small)
            ) {
                items(messages, key = { it.id }) { message ->
                    MessageBubble(
                        message = message,
                        onReactionClick = { emoji ->
                            onReactionClick(message.id.toLongOrNull() ?: 0, emoji)
                        },
                        onEditClick = {
                            onEditClick(message.id.toLongOrNull() ?: 0)
                        },
                        onDeleteClick = {
                            onDeleteClick(message.id.toLongOrNull() ?: 0)
                        }
                    )
                }
                
                // Typing indicator
                if (typingUsers.isNotEmpty()) {
                    item {
                        TypingIndicator(
                            users = typingUsers,
                            modifier = Modifier.padding(Spacing.Small)
                        )
                    }
                }
            }
        }
    }
}

/**
 * Message Bubble Component
 */
@Composable
private fun MessageBubble(
    message: ChatMessage,
    onReactionClick: (String) -> Unit,
    onEditClick: () -> Unit,
    onDeleteClick: () -> Unit
) {
    var showMenu by remember { mutableStateOf(false) }
    
    Column(
        modifier = Modifier.fillMaxWidth()
    ) {
        ElevatedSurface(
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(Spacing.Medium)
            ) {
                // Author header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.Small)
                    ) {
                        Text(
                            text = message.authorName,
                            style = MaterialTheme.typography.titleSmall,
                            color = if (message.isFromBot) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurface
                            }
                        )
                        
                        if (message.isFromBot) {
                            BetaBadge()
                        }
                    }
                    
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.XSmall)
                    ) {
                        Text(
                            text = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault())
                                .format(java.util.Date(message.timestamp)),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        
                        if (message.isEdited) {
                            Text(
                                text = "(edited)",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        
                        // Message menu
                        Box {
                            IconButton(
                                onClick = { showMenu = true }
                            ) {
                                Icon(
                                    imageVector = AppIcons.MoreVert,
                                    contentDescription = "Message options",
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                            
                            DropdownMenu(
                                expanded = showMenu,
                                onDismissRequest = { showMenu = false }
                            ) {
                                DropdownMenuItem(
                                    text = { Text("React") },
                                    onClick = {
                                        onReactionClick("👍")
                                        showMenu = false
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text("Edit") },
                                    onClick = {
                                        onEditClick()
                                        showMenu = false
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text("Delete") },
                                    onClick = {
                                        onDeleteClick()
                                        showMenu = false
                                    }
                                )
                            }
                        }
                    }
                }
                
                Spacer(modifier = Modifier.height(Spacing.XSmall))
                
                // Reply indicator
                if (message.isReply && message.replyToContent != null) {
                    Text(
                        text = "↪ Replying to: ${message.replyToContent.take(50)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = Spacing.XSmall)
                    )
                }
                
                // Message content
                Text(
                    text = message.content,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
                
                // Reactions
                if (message.hasReactions) {
                    Spacer(modifier = Modifier.height(Spacing.Small))
                    
                    WrappedChipGroup {
                        message.reactions.forEach { (emoji, count) ->
                            AssistActionChip(
                                label = "$emoji $count",
                                onClick = { onReactionClick(emoji) }
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Typing Indicator
 */
@Composable
private fun TypingIndicator(
    users: List<String>,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.Small)
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(16.dp),
            strokeWidth = 2.dp
        )
        
        Text(
            text = when (users.size) {
                1 -> "${users[0]} is typing..."
                2 -> "${users[0]} and ${users[1]} are typing..."
                else -> "${users.size} users are typing..."
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

/**
 * Message Input Bar at bottom
 */
@Composable
private fun MessageInputBar(
    isSendingMessage: Boolean,
    onSendMessage: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var messageText by remember { mutableStateOf("") }
    
    Surface(
        modifier = modifier,
        shadowElevation = 8.dp,
        tonalElevation = 2.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.Medium),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(Spacing.Small)
        ) {
            // Message input field
            OutlinedInputField(
                value = messageText,
                onValueChange = { messageText = it },
                label = "Message",
                placeholder = "Type a message...",
                enabled = !isSendingMessage,
                singleLine = false,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 56.dp, max = 120.dp),
                maxLines = 4
            )
            
            // Send button
            FilledIconButton(
                icon = AppIcons.Done, // Using Done icon as Send
                contentDescription = "Send message",
                onClick = {
                    if (messageText.isNotBlank()) {
                        onSendMessage(messageText.trim())
                        messageText = ""
                    }
                },
                enabled = messageText.isNotBlank() && !isSendingMessage,
                modifier = Modifier.size(56.dp)
            )
        }
    }
}
