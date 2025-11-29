package com.infinitygauntlet.simulation

import android.os.Bundle
import android.view.MenuItem
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModelProvider
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.chip.Chip
import com.infinitygauntlet.simulation.adapters.ChatMessageAdapter
import com.infinitygauntlet.simulation.models.ChatMessage
import com.infinitygauntlet.simulation.viewmodels.ChatViewModel

/**
 * Chat UI Activity - Discord-like interface for testing bot interactions
 * Supports 3 channels and 5 commands
 */
class ChatUIActivity : AppCompatActivity() {
    
    private lateinit var viewModel: ChatViewModel
    private lateinit var adapter: ChatMessageAdapter
    
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
        viewModel.switchChannel("homestead")
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
            viewModel.switchChannel("homestead")
        }
        
        findViewById<Chip>(R.id.chipArena).setOnClickListener {
            viewModel.switchChannel("arena")
        }
        
        findViewById<Chip>(R.id.chipWildArea).setOnClickListener {
            viewModel.switchChannel("wild-area")
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
        viewModel.messages.observe(this) { messages ->
            adapter.submitList(messages)
            scrollToBottom()
        }
        
        viewModel.currentChannel.observe(this) { channel ->
            supportActionBar?.subtitle = "#$channel"
            updateChannelChips(channel)
        }
        
        viewModel.isTyping.observe(this) { isTyping ->
            findViewById<android.widget.TextView>(R.id.typingIndicator).visibility =
                if (isTyping) View.VISIBLE else View.GONE
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
