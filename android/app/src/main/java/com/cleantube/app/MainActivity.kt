package com.cleantube.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.PictureInPictureParams
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Looper
import android.util.Rational
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.cleantube.app.bridge.CleanTubeNativeBridge
import com.cleantube.app.service.BackgroundPlaybackService
import com.cleantube.app.web.AdBlockNetworkFilter
import com.cleantube.app.web.BackgroundWebView
import com.cleantube.app.web.CleanTubeWebChromeClient
import com.cleantube.app.web.CleanTubeWebViewClient

/**
 * Primary host activity wiring [BackgroundWebView], document-start userscript injection,
 * fullscreen video, native Picture-in-Picture, deep-link routing, and background media service sync.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: BackgroundWebView
    private lateinit var fullscreenContainer: FrameLayout
    private lateinit var loadingBar: ProgressBar
    private lateinit var webChromeClient: CleanTubeWebChromeClient

    private val adBlockFilter = AdBlockNetworkFilter(enabled = true)
    private var backgroundPlayEnabled: Boolean = true
    private var isMediaPlaying: Boolean = false
    private var hasActiveService: Boolean = false
    private var currentTitle: String = ""
    private var currentChannel: String = ""
    private var cachedUserscript: String = ""

    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private var commandReceiverRegistered: Boolean = false

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* Permission result handled gracefully; playback continues either way. */ }

    private val commandReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != BackgroundPlaybackService.BROADCAST_MEDIA_COMMAND) return
            val cmd = intent.getStringExtra(BackgroundPlaybackService.EXTRA_COMMAND) ?: return
            if (cmd !in ALLOWED_MEDIA_COMMANDS) return
            if (cmd == "stop") {
                isMediaPlaying = false
                hasActiveService = false
            }
            webView.post {
                webView.evaluateJavascript(
                    "window.__CLEANTUBE_NATIVE_CMD__ && window.__CLEANTUBE_NATIVE_CMD__('$cmd')",
                    null
                )
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        configureSystemBars()

        webView = findViewById(R.id.webView)
        fullscreenContainer = findViewById(R.id.fullscreenContainer)
        loadingBar = findViewById(R.id.loadingBar)

        cachedUserscript = readUserscriptAsset()
        configureWebView()
        registerBackNavigation()
        registerCommandReceiver()
        requestNotificationPermissionIfNeeded()

        webView.loadUrl(normalizeYouTubeUrl(intent))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.data != null) {
            webView.loadUrl(normalizeYouTubeUrl(intent))
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (backgroundPlayEnabled && isMediaPlaying && customView == null) {
            enterNativePiP()
        }
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        if (isInPictureInPictureMode) {
            loadingBar.visibility = View.GONE
        }
    }

    override fun onPause() {
        // Do not call webView.onPause() or webView.pauseTimers() so background playback stays alive.
        super.onPause()
    }

    override fun onStop() {
        super.onStop()
    }

    override fun onDestroy() {
        BackgroundPlaybackService.stop(this)
        if (commandReceiverRegistered) {
            unregisterReceiver(commandReceiver)
            commandReceiverRegistered = false
        }
        if (::webView.isInitialized) {
            (webView.parent as? ViewGroup)?.removeView(webView)
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }

    private fun configureSystemBars() {
        val obsidian = Color.parseColor("#0F0F0F")
        @Suppress("DEPRECATION")
        window.statusBarColor = obsidian
        @Suppress("DEPRECATION")
        window.navigationBarColor = obsidian
        WindowCompat.getInsetsController(window, window.decorView)?.apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
    }

    private fun readUserscriptAsset(): String =
        try {
            assets.open(USERSCRIPT_ASSET).bufferedReader().use { it.readText() }
        } catch (_: Exception) {
            ""
        }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportMultipleWindows(false)
            userAgentString = userAgentString.replace("; wv", "")
        }

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        val bridge = CleanTubeNativeBridge(createBridgeListener())
        webView.addJavascriptInterface(bridge, JS_BRIDGE_NAME)

        val useFallbackInjection = if (
            cachedUserscript.isNotBlank() &&
            WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
        ) {
            WebViewCompat.addDocumentStartJavaScript(
                webView,
                cachedUserscript,
                DOCUMENT_START_ORIGINS
            )
            false
        } else {
            true
        }

        webView.webViewClient = CleanTubeWebViewClient(
            adBlockFilter = adBlockFilter,
            userscriptProvider = { cachedUserscript },
            useFallbackInjection = { useFallbackInjection },
            onPageLoadingChanged = { isLoading ->
                if (!isInPictureInPictureMode) {
                    loadingBar.visibility = if (isLoading) View.VISIBLE else View.GONE
                }
            }
        )

        webChromeClient = CleanTubeWebChromeClient(
            onEnterFullscreen = { view, callback -> enterFullscreen(view, callback) },
            onExitFullscreen = { exitFullscreen() },
            onProgressChangedCallback = { progress ->
                if (!isInPictureInPictureMode) {
                    loadingBar.progress = progress
                    loadingBar.visibility = if (progress in 1..99) View.VISIBLE else View.GONE
                }
            }
        )
        webView.webChromeClient = webChromeClient
    }

    private fun createBridgeListener(): CleanTubeNativeBridge.Listener =
        object : CleanTubeNativeBridge.Listener {
            override fun onRequestPiP(): Boolean {
                if (!canEnterPiP()) return false
                return if (Looper.myLooper() == Looper.getMainLooper()) {
                    enterNativePiP()
                } else {
                    webView.post { enterNativePiP() }
                    true
                }
            }

            override fun onBackgroundPlaySettingChanged(enabled: Boolean) {
                backgroundPlayEnabled = enabled
                webView.allowBackgroundPlayback = enabled
                runOnUiThread {
                    if (!enabled) {
                        hasActiveService = false
                        BackgroundPlaybackService.stop(this@MainActivity)
                    } else if (isMediaPlaying) {
                        hasActiveService = true
                        BackgroundPlaybackService.startOrUpdate(
                            this@MainActivity,
                            currentTitle,
                            currentChannel,
                            true
                        )
                    }
                }
            }

            override fun onAdBlockSettingChanged(enabled: Boolean) {
                adBlockFilter.enabled = enabled
            }

            override fun onMediaStateUpdated(title: String, channel: String, isPlaying: Boolean) {
                currentTitle = title
                currentChannel = channel
                isMediaPlaying = isPlaying
                runOnUiThread {
                    if (!backgroundPlayEnabled) {
                        hasActiveService = false
                        BackgroundPlaybackService.stop(this@MainActivity)
                        return@runOnUiThread
                    }
                    if (isPlaying || (hasActiveService && title.isNotBlank())) {
                        hasActiveService = true
                        BackgroundPlaybackService.startOrUpdate(
                            this@MainActivity,
                            title,
                            channel,
                            isPlaying
                        )
                    }
                }
            }
        }

    private fun canEnterPiP(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

    private fun enterNativePiP(): Boolean {
        if (!canEnterPiP()) return false
        val params = PictureInPictureParams.Builder()
            .setAspectRatio(Rational(16, 9))
            .build()
        return enterPictureInPictureMode(params)
    }

    private fun enterFullscreen(view: View, callback: WebChromeClient.CustomViewCallback) {
        if (customView != null) {
            callback.onCustomViewHidden()
            return
        }
        customView = view
        customViewCallback = callback
        fullscreenContainer.addView(
            view,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        fullscreenContainer.visibility = View.VISIBLE
        webView.visibility = View.GONE

        WindowCompat.getInsetsController(window, window.decorView)?.apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
    }

    private fun exitFullscreen() {
        val view = customView ?: return
        fullscreenContainer.removeView(view)
        fullscreenContainer.visibility = View.GONE
        webView.visibility = View.VISIBLE
        customView = null
        customViewCallback?.onCustomViewHidden()
        customViewCallback = null

        WindowCompat.getInsetsController(window, window.decorView)
            ?.show(WindowInsetsCompat.Type.systemBars())
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    }

    private fun registerBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    customView != null -> webChromeClient.onHideCustomView()
                    webView.canGoBack() -> webView.goBack()
                    backgroundPlayEnabled && isMediaPlaying -> moveTaskToBack(true)
                    else -> finish()
                }
            }
        })
    }

    private fun registerCommandReceiver() {
        ContextCompat.registerReceiver(
            this,
            commandReceiver,
            IntentFilter(BackgroundPlaybackService.BROADCAST_MEDIA_COMMAND),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
        commandReceiverRegistered = true
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) return

        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        if (prefs.getBoolean(KEY_ASKED_NOTIFICATIONS, false)) return
        prefs.edit().putBoolean(KEY_ASKED_NOTIFICATIONS, true).apply()
        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    /**
     * Normalizes incoming YouTube deep-link URIs to `https://m.youtube.com`.
     */
    fun normalizeYouTubeUrl(intent: Intent?): String {
        val uri: Uri = intent?.data ?: return DEFAULT_URL
        val host = uri.host?.lowercase() ?: return DEFAULT_URL

        return when (host) {
            "youtu.be", "www.youtu.be" -> {
                val videoId = uri.pathSegments.firstOrNull()?.takeIf { it.isNotBlank() }
                    ?: return DEFAULT_URL
                val builder = Uri.Builder()
                    .scheme("https")
                    .authority(MOBILE_HOST)
                    .path("/watch")
                    .appendQueryParameter("v", videoId)
                for (name in uri.queryParameterNames) {
                    if (name != "v") {
                        uri.getQueryParameters(name).forEach { value ->
                            builder.appendQueryParameter(name, value)
                        }
                    }
                }
                builder.build().toString()
            }

            "www.youtube.com", "youtube.com", "m.youtube.com" -> {
                uri.buildUpon()
                    .scheme("https")
                    .authority(MOBILE_HOST)
                    .build()
                    .toString()
            }

            else -> DEFAULT_URL
        }
    }

    companion object {
        private const val MOBILE_HOST = "m.youtube.com"
        private const val DEFAULT_URL = "https://$MOBILE_HOST"
        private const val USERSCRIPT_ASSET = "cleantube.user.js"
        private const val JS_BRIDGE_NAME = "CleanTubeAndroid"
        private const val PREFS_NAME = "cleantube_prefs"
        private const val KEY_ASKED_NOTIFICATIONS = "asked_notifications"

        private val DOCUMENT_START_ORIGINS = setOf(
            "https://m.youtube.com",
            "https://www.youtube.com"
        )

        private val ALLOWED_MEDIA_COMMANDS = setOf(
            "play",
            "pause",
            "toggle",
            "seekBackward",
            "seekForward",
            "stop"
        )
    }
}
