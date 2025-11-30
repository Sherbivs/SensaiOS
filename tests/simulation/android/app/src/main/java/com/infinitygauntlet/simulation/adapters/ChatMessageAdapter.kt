package com.infinitygauntlet.simulation.adapters

import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.card.MaterialCardView
import com.infinitygauntlet.simulation.R
import com.infinitygauntlet.simulation.domain.models.ChatMessage

/**
 * RecyclerView Adapter for ChatMessage list
 * Displays chat messages with different styling for user/bot messages
 */
class ChatMessageAdapter : ListAdapter<ChatMessage, ChatMessageAdapter.ViewHolder>(DiffCallback()) {
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_chat_message, parent, false)
        return ViewHolder(view)
    }
    
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }
    
    class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        
        private val messageContainer: LinearLayout = itemView.findViewById(R.id.messageContainer)
        private val messageCard: MaterialCardView = itemView.findViewById(R.id.messageCard)
        private val senderText: TextView = itemView.findViewById(R.id.senderText)
        private val messageText: TextView = itemView.findViewById(R.id.messageText)
        private val timestampText: TextView = itemView.findViewById(R.id.timestampText)
        
        fun bind(message: ChatMessage) {
            senderText.text = message.sender
            messageText.text = message.text
            timestampText.text = message.getFormattedTime()
            
            // Style differently for user vs bot messages
            if (message.isBot) {
                // Bot message - align left, gray background
                messageContainer.gravity = Gravity.START
                messageCard.setCardBackgroundColor(
                    itemView.context.getColor(R.color.bot_message_background)
                )
                senderText.setTextColor(
                    itemView.context.getColor(R.color.bot_sender_text)
                )
            } else {
                // User message - align right, primary color background
                messageContainer.gravity = Gravity.END
                messageCard.setCardBackgroundColor(
                    itemView.context.getColor(R.color.user_message_background)
                )
                senderText.setTextColor(
                    itemView.context.getColor(R.color.user_sender_text)
                )
                messageText.setTextColor(
                    itemView.context.getColor(android.R.color.white)
                )
                timestampText.setTextColor(
                    itemView.context.getColor(R.color.user_timestamp_text)
                )
            }
            
            // Special styling for commands
            if (message.isCommand()) {
                messageText.setTypeface(null, android.graphics.Typeface.BOLD_ITALIC)
            } else {
                messageText.setTypeface(null, android.graphics.Typeface.NORMAL)
            }
        }
    }
    
    private class DiffCallback : DiffUtil.ItemCallback<ChatMessage>() {
        override fun areItemsTheSame(oldItem: ChatMessage, newItem: ChatMessage): Boolean {
            return oldItem.id == newItem.id
        }
        
        override fun areContentsTheSame(oldItem: ChatMessage, newItem: ChatMessage): Boolean {
            return oldItem == newItem
        }
    }
}
