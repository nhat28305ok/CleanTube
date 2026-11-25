package com.cleantube.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.os.Build
import android.os.IBinder
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.media.app.NotificationCompat.MediaStyle
import com.cleantube.app.MainActivity
import com.cleantube.app.R

/**
 * Foreground media service that keeps CleanTube playback alive in the background
 * and exposes lock-screen / notification transport controls via [MediaSessionCompat].
 */
class BackgroundPlaybackService : Service() {

    private lateinit var mediaSession: MediaSessionCompat
    private var currentTitle: String = ""
    private var currentChannel: String = ""
    private var isPlaying: Boolean = false
    private var noisyReceiverRegistered: Boolean = false

    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
                isPlaying = false
                sendMediaCommand("pause")
                updateMediaSession()
                startForegroundCompat(buildNotification())
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        initMediaSession()
        ContextCompat.registerReceiver(
            this,
            noisyReceiver,
            IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
        noisyReceiverRegistered = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_UPDATE_STATE -> {
                currentTitle = intent.getStringExtra(EXTRA_TITLE)
                    ?.takeIf { it.isNotBlank() }
                    ?: getString(R.string.app_name)
                currentChannel = intent.getStringExtra(EXTRA_CHANNEL).orEmpty()
                isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, false)
                updateMediaSession()
                startForegroundCompat(buildNotification())
            }

            ACTION_TOGGLE_PLAY -> {
                isPlaying = !isPlaying
                sendMediaCommand("toggle")
                updateMediaSession()
                startForegroundCompat(buildNotification())
            }

            ACTION_REWIND -> {
                sendMediaCommand("seekBackward")
                startForegroundCompat(buildNotification())
            }

            ACTION_FORWARD -> {
                sendMediaCommand("seekForward")
                startForegroundCompat(buildNotification())
            }

            ACTION_STOP -> {
                isPlaying = false
                sendMediaCommand("stop")
                ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }

            else -> {
                updateMediaSession()
                startForegroundCompat(buildNotification())
            }
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        if (noisyReceiverRegistered) {
            unregisterReceiver(noisyReceiver)
            noisyReceiverRegistered = false
        }
        if (::mediaSession.isInitialized) {
            mediaSession.isActive = false
            mediaSession.release()
        }
        super.onDestroy()
    }

    private fun initMediaSession() {
        mediaSession = MediaSessionCompat(this, "CleanTubeMediaSession").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() {
                    isPlaying = true
                    sendMediaCommand("play")
                    updateMediaSession()
                    startForegroundCompat(buildNotification())
                }

                override fun onPause() {
                    isPlaying = false
                    sendMediaCommand("pause")
                    updateMediaSession()
                    startForegroundCompat(buildNotification())
                }

                override fun onRewind() {
                    sendMediaCommand("seekBackward")
                }

                override fun onFastForward() {
                    sendMediaCommand("seekForward")
                }

                override fun onStop() {
                    isPlaying = false
                    sendMediaCommand("stop")
                    ServiceCompat.stopForeground(
                        this@BackgroundPlaybackService,
                        ServiceCompat.STOP_FOREGROUND_REMOVE
                    )
                    stopSelf()
                }
            })
            isActive = true
        }
        updateMediaSession()
    }

    private fun updateMediaSession() {
        if (!::mediaSession.isInitialized) return
        val title = currentTitle.ifBlank { getString(R.string.app_name) }
        val metadata = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentChannel)
            .build()
        mediaSession.setMetadata(metadata)

        val state = if (isPlaying) {
            PlaybackStateCompat.STATE_PLAYING
        } else {
            PlaybackStateCompat.STATE_PAUSED
        }
        val playbackState = PlaybackStateCompat.Builder()
            .setActions(SUPPORTED_MEDIA_ACTIONS)
            .setState(
                state,
                PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN,
                if (isPlaying) 1.0f else 0.0f
            )
            .build()
        mediaSession.setPlaybackState(playbackState)
    }

    private fun createNotificationChannel() {
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.notification_channel_desc)
            setShowBadge(false)
            enableVibration(false)
            setSound(null, null)
        }
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentIntent = PendingIntent.getActivity(
            this,
            0,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val playPauseIcon = if (isPlaying) R.drawable.ic_pause else R.drawable.ic_play
        val playPauseLabel = getString(if (isPlaying) R.string.action_pause else R.string.action_play)

        val title = currentTitle.ifBlank { getString(R.string.app_name) }
        val subtitle = currentChannel.ifBlank { getString(R.string.app_name) }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setContentIntent(contentIntent)
            .setOngoing(isPlaying)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(
                R.drawable.ic_replay_10,
                getString(R.string.action_rewind),
                serviceActionIntent(ACTION_REWIND, 1)
            )
            .addAction(
                playPauseIcon,
                playPauseLabel,
                serviceActionIntent(ACTION_TOGGLE_PLAY, 2)
            )
            .addAction(
                R.drawable.ic_forward_10,
                getString(R.string.action_forward),
                serviceActionIntent(ACTION_FORWARD, 3)
            )
            .addAction(
                R.drawable.ic_close,
                getString(R.string.action_stop),
                serviceActionIntent(ACTION_STOP, 4)
            )
            .setStyle(
                MediaStyle()
                    .setMediaSession(mediaSession.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2)
            )
            .build()
    }

    private fun serviceActionIntent(action: String, requestCode: Int): PendingIntent {
        val intent = Intent(this, BackgroundPlaybackService::class.java).setAction(action)
        return PendingIntent.getService(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun startForegroundCompat(notification: Notification) {
        val foregroundType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        } else {
            0
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, foregroundType)
    }

    private fun sendMediaCommand(cmd: String) {
        sendBroadcast(
            Intent(BROADCAST_MEDIA_COMMAND)
                .setPackage(packageName)
                .putExtra(EXTRA_COMMAND, cmd)
        )
    }

    companion object {
        const val ACTION_UPDATE_STATE = "com.cleantube.app.action.UPDATE_STATE"
        const val ACTION_STOP = "com.cleantube.app.action.STOP"
        const val ACTION_REWIND = "com.cleantube.app.action.REWIND"
        const val ACTION_TOGGLE_PLAY = "com.cleantube.app.action.TOGGLE_PLAY"
        const val ACTION_FORWARD = "com.cleantube.app.action.FORWARD"

        const val EXTRA_TITLE = "extra_title"
        const val EXTRA_CHANNEL = "extra_channel"
        const val EXTRA_IS_PLAYING = "extra_is_playing"

        const val BROADCAST_MEDIA_COMMAND = "com.cleantube.app.BROADCAST_MEDIA_COMMAND"
        const val EXTRA_COMMAND = "extra_command"

        private const val CHANNEL_ID = "cleantube_playback"
        private const val NOTIFICATION_ID = 1001

        private const val SUPPORTED_MEDIA_ACTIONS =
            PlaybackStateCompat.ACTION_PLAY or
                PlaybackStateCompat.ACTION_PAUSE or
                PlaybackStateCompat.ACTION_PLAY_PAUSE or
                PlaybackStateCompat.ACTION_REWIND or
                PlaybackStateCompat.ACTION_FAST_FORWARD or
                PlaybackStateCompat.ACTION_STOP

        /**
         * Starts the foreground playback service or updates its displayed media metadata and state.
         */
        fun startOrUpdate(
            context: Context,
            title: String,
            channel: String,
            isPlaying: Boolean
        ) {
            val intent = Intent(context, BackgroundPlaybackService::class.java).apply {
                action = ACTION_UPDATE_STATE
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_CHANNEL, channel)
                putExtra(EXTRA_IS_PLAYING, isPlaying)
            }
            ContextCompat.startForegroundService(context, intent)
        }

        /**
         * Stops the foreground playback service if it is currently running.
         */
        fun stop(context: Context) {
            context.stopService(Intent(context, BackgroundPlaybackService::class.java))
        }
    }
}
