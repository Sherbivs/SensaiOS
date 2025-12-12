package com.infinitygauntlet.simulation

import android.os.Bundle
import android.view.MenuItem
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.Lifecycle
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.chip.Chip
import com.infinitygauntlet.simulation.adapters.ChatMessageAdapter
import com.infinitygauntlet.simulation.domain.models.ChatMessage
import com.infinitygauntlet.simulation.presentation.chat.ChatViewModel
import kotlinx.coroutines.launch

/**
 * Chat UI Activity - Discord-like interface for testing bot interactions
 * Supports 3 channels and 5 commands
 */
class ChatUIActivity : AppCompatActivity() {
    
    private lateinit var viewModel: ChatViewModel
    private lateinit var adapter: ChatMessageAdapter
    
    // Channel name to ID mapping (hardcoded for demo)
    private val channelIds = mapOf(
        "homestead" to 1L,
        "arena" to 2L,
        "wild-area" to 3L
    )
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_chat)
        
        // Setup toolbar
        setSupportActionBar(findViewById(R.id.toolbar))
        supportActionBar?.apply {
            title = "Chat UI"
            setDisplayHomeAsUpEnabled(true)
        }
        
        // Initialize ViewModel
        viewModel = ViewModelProvider(this)[ChatViewModel::class.java]
        
        // Setup RecyclerView
        setupRecyclerView()
        
        // Setup channel chips
        setupChannelChips()
        
        // Setup input
        setupInput()
        
        // Observe messages
        observeMessages()
        
        // Load initial channel
        channelIds["homestead"]?.let { viewModel.switchChannel(it) }
    }
    
    private fun setupRecyclerView() {
        adapter = ChatMessageAdapter()
        
        findViewById<androidx.recyclerview.widget.RecyclerView>(R.id.messagesRecyclerView).apply {
            layoutManager = LinearLayoutManager(this@ChatUIActivity).apply {
                stackFromEnd = true
            }
            adapter = this@ChatUIActivity.adapter
        }
    }
    
    private fun setupChannelChips() {
        val chipGroup = findViewById<com.google.android.material.chip.ChipGroup>(R.id.channelChipGroup)
        
        findViewById<Chip>(R.id.chipHomestead).setOnClickListener {
            channelIds["homestead"]?.let { viewModel.switchChannel(it) }
        }
        
        findViewById<Chip>(R.id.chipArena).setOnClickListener {
            channelIds["arena"]?.let { viewModel.switchChannel(it) }
        }
        
        findViewById<Chip>(R.id.chipWildArea).setOnClickListener {
            channelIds["wild-area"]?.let { viewModel.switchChannel(it) }
        }
    }
    
    private fun setupInput() {
        val inputField = findViewById<com.google.android.material.textfield.TextInputEditText>(R.id.messageInput)
        val sendButton = findViewById<com.google.android.material.button.MaterialButton>(R.id.sendButton)
        
        sendButton.setOnClickListener {
            val message = inputField.text.toString().trim()
            if (message.isNotEmpty()) {
                viewModel.sendMessage(message)
                inputField.text?.clear()
                scrollToBottom()
            }
        }
        
        // Quick command buttons
        findViewById<com.google.android.material.button.MaterialButton>(R.id.btnStarter).setOnClickListener {
            sendCommand("/starter")
        }
        
        findViewById<com.google.android.material.button.MaterialButton>(R.id.btnHome).setOnClickListener {
            sendCommand("/home")
        }
        
        findViewById<com.google.android.material.button.MaterialButton>(R.id.btnWalk).setOnClickListener {
            sendCommand("/walk")
        }
        
        findViewById<com.google.android.material.button.MaterialButton>(R.id.btnHeal).setOnClickListener {
            sendCommand("/heal")
        }
        
        findViewById<com.google.android.material.button.MaterialButton>(R.id.btnBattle).setOnClickListener {
            sendCommand("/battle")
        }
    }
    
    private fun observeMessages() {
        // Observe UI state using StateFlow with proper lifecycle awareness
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.uiState.collect { state ->
                    // Update messages list
                    adapter.submitList(state.messages)
                    
                    // Update channel chips based on current channel
                    state.currentChannel?.let { channel ->
                        updateChannelChips(channel.name)
                        supportActionBar?.subtitle = "#${channel.name}"
                    }
                    
                    // Update typing indicator
                    findViewById<android.widget.TextView>(R.id.typingIndicator).apply {
                        visibility = if (state.isTyping) View.VISIBLE else View.GONE
                        text = if (state.typingUsers.isNotEmpty()) {
                            "${state.typingUsers.joinToString(", ")} is typing..."
                        } else {
                            ""
                        }
                    }
                    
                    // Auto-scroll to bottom when new messages arrive
                    if (state.messages.isNotEmpty()) {
                        scrollToBottom()
                    }
                }
            }
        }
    }
    
    private fun sendCommand(command: String) {
        findViewById<com.google.android.material.textfield.TextInputEditText>(R.id.messageInput).setText(command)
        findViewById<com.google.android.material.button.MaterialButton>(R.id.sendButton).performClick()
    }
    
    private fun scrollToBottom() {
        val recyclerView = findViewById<androidx.recyclerview.widget.RecyclerView>(R.id.messagesRecyclerView)
        if (adapter.itemCount > 0) {
            recyclerView.smoothScrollToPosition(adapter.itemCount - 1)
        }
    }
    
    private fun updateChannelChips(currentChannel: String) {
        findViewById<Chip>(R.id.chipHomestead).isChecked = currentChannel == "homestead"
        findViewById<Chip>(R.id.chipArena).isChecked = currentChannel == "arena"
        findViewById<Chip>(R.id.chipWildArea).isChecked = currentChannel == "wild-area"
    }
    
    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            android.R.id.home -> {
                finish()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }
}
