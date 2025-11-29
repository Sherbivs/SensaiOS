package com.infinitygauntlet.simulation.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * Centralized icon definitions
 * Common Material Icons used throughout the app
 */

object AppIcons {
    // Navigation
    val Home: ImageVector = Icons.Default.Home
    val ArrowBack: ImageVector = Icons.Default.ArrowBack
    val Menu: ImageVector = Icons.Default.Menu
    val Close: ImageVector = Icons.Default.Close
    val ChevronRight: ImageVector = Icons.Default.ChevronRight
    val ChevronLeft: ImageVector = Icons.Default.ChevronLeft
    val ExpandMore: ImageVector = Icons.Default.ExpandMore
    val ExpandLess: ImageVector = Icons.Default.ExpandLess
    
    // Actions
    val Add: ImageVector = Icons.Default.Add
    val Remove: ImageVector = Icons.Default.Remove
    val Edit: ImageVector = Icons.Default.Edit
    val Delete: ImageVector = Icons.Default.Delete
    val Done: ImageVector = Icons.Default.Done
    val Clear: ImageVector = Icons.Default.Clear
    val Refresh: ImageVector = Icons.Default.Refresh
    val Share: ImageVector = Icons.Default.Share
    val Save: ImageVector = Icons.Default.Save
    val Download: ImageVector = Icons.Default.Download
    val Upload: ImageVector = Icons.Default.Upload
    
    // Status
    val CheckCircle: ImageVector = Icons.Default.CheckCircle
    val Error: ImageVector = Icons.Default.Error
    val Warning: ImageVector = Icons.Default.Warning
    val Info: ImageVector = Icons.Default.Info
    val HourglassEmpty: ImageVector = Icons.Default.HourglassEmpty
    val Block: ImageVector = Icons.Default.Block
    
    // Content
    val Search: ImageVector = Icons.Default.Search
    val SearchOff: ImageVector = Icons.Default.SearchOff
    val Filter: ImageVector = Icons.Default.FilterList
    val Sort: ImageVector = Icons.Default.Sort
    val MoreVert: ImageVector = Icons.Default.MoreVert
    val MoreHoriz: ImageVector = Icons.Default.MoreHoriz
    val Settings: ImageVector = Icons.Default.Settings
    
    // Visibility
    val Visibility: ImageVector = Icons.Default.Visibility
    val VisibilityOff: ImageVector = Icons.Default.VisibilityOff
    
    // Communication
    val Notifications: ImageVector = Icons.Default.Notifications
    val NotificationsOff: ImageVector = Icons.Default.NotificationsOff
    val Email: ImageVector = Icons.Default.Email
    val Message: ImageVector = Icons.Default.Message
    
    // Media
    val PlayArrow: ImageVector = Icons.Default.PlayArrow
    val Pause: ImageVector = Icons.Default.Pause
    val Stop: ImageVector = Icons.Default.Stop
    val SkipNext: ImageVector = Icons.Default.SkipNext
    val SkipPrevious: ImageVector = Icons.Default.SkipPrevious
    
    // Files
    val Folder: ImageVector = Icons.Default.Folder
    val FolderOpen: ImageVector = Icons.Default.FolderOpen
    val Description: ImageVector = Icons.Default.Description
    val Image: ImageVector = Icons.Default.Image
    val AttachFile: ImageVector = Icons.Default.AttachFile
    
    // User
    val Person: ImageVector = Icons.Default.Person
    val Group: ImageVector = Icons.Default.Group
    val AccountCircle: ImageVector = Icons.Default.AccountCircle
    val Login: ImageVector = Icons.Default.Login
    val Logout: ImageVector = Icons.Default.Logout
    
    // Location
    val LocationOn: ImageVector = Icons.Default.LocationOn
    val Map: ImageVector = Icons.Default.Map
    val Place: ImageVector = Icons.Default.Place
    
    // Time
    val Schedule: ImageVector = Icons.Default.Schedule
    val Today: ImageVector = Icons.Default.Today
    val Event: ImageVector = Icons.Default.Event
    val History: ImageVector = Icons.Default.History
    
    // Device
    val Smartphone: ImageVector = Icons.Default.Smartphone
    val Computer: ImageVector = Icons.Default.Computer
    val Wifi: ImageVector = Icons.Default.Wifi
    val WifiOff: ImageVector = Icons.Default.WifiOff
    val Battery: ImageVector = Icons.Default.BatteryFull
    
    // Favorites
    val Favorite: ImageVector = Icons.Default.Favorite
    val FavoriteBorder: ImageVector = Icons.Default.FavoriteBorder
    val Star: ImageVector = Icons.Default.Star
    val StarBorder: ImageVector = Icons.Default.StarBorder
    
    // Shopping
    val ShoppingCart: ImageVector = Icons.Default.ShoppingCart
    val Payment: ImageVector = Icons.Default.Payment
    val Receipt: ImageVector = Icons.Default.Receipt
    
    // Security
    val Lock: ImageVector = Icons.Default.Lock
    val LockOpen: ImageVector = Icons.Default.LockOpen
    val Security: ImageVector = Icons.Default.Security
    val Shield: ImageVector = Icons.Default.Shield
    
    // System
    val Help: ImageVector = Icons.Default.Help
    val HelpOutline: ImageVector = Icons.Default.HelpOutline
    val Feedback: ImageVector = Icons.Default.Feedback
    val BugReport: ImageVector = Icons.Default.BugReport
    
    // Pokemon-specific (using available icons)
    val CatchingPokemon: ImageVector = Icons.Default.Circle // Pokeball representation
    val Battle: ImageVector = Icons.Default.SportsMartialArts
    val Team: ImageVector = Icons.Default.Group
    val Pokedex: ImageVector = Icons.Default.Book
    val Items: ImageVector = Icons.Default.Backpack
    val Badge: ImageVector = Icons.Default.EmojiEvents
    
    // Test-specific
    val TestTube: ImageVector = Icons.Default.Science
    val Code: ImageVector = Icons.Default.Code
    val Terminal: ImageVector = Icons.Default.Terminal
    val DataObject: ImageVector = Icons.Default.DataObject
    val ApiIcon: ImageVector = Icons.Default.Api
}

/**
 * Icon size helpers
 * Standardized icon sizes for consistency
 */
object IconSizes {
    val XSmall = androidx.compose.ui.unit.Dp(16f)
    val Small = androidx.compose.ui.unit.Dp(20f)
    val Medium = androidx.compose.ui.unit.Dp(24f)
    val Large = androidx.compose.ui.unit.Dp(32f)
    val XLarge = androidx.compose.ui.unit.Dp(48f)
    val XXLarge = androidx.compose.ui.unit.Dp(64f)
}
