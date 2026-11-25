package com.cleantube.app.bridge

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface

/**
 * JavaScript bridge exposed to the CleanTube userscript for native PiP,
 * background playback/ad-block toggles, and media session metadata updates.
 */
class CleanTubeNativeBridge(private val listener: Listener) {

    interface Listener {
        fun onRequestPiP(): Boolean
        fun onBackgroundPlaySettingChanged(enabled: Boolean)
        fun onAdBlockSettingChanged(enabled: Boolean)
        fun onMediaStateUpdated(title: String, channel: String, isPlaying: Boolean)
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun isNativeApp(): Boolean = true

    @JavascriptInterface
    fun enterPiP(): Boolean {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            return listener.onRequestPiP()
        }
        mainHandler.post { listener.onRequestPiP() }
        return true
    }

    @JavascriptInterface
    fun setBackgroundPlayEnabled(enabled: Boolean) {
        mainHandler.post { listener.onBackgroundPlaySettingChanged(enabled) }
    }

    @JavascriptInterface
    fun setAdBlockEnabled(enabled: Boolean) {
        mainHandler.post { listener.onAdBlockSettingChanged(enabled) }
    }

    @JavascriptInterface
    fun updateMediaState(title: String?, channel: String?, isPlaying: Boolean) {
        val safeTitle = title?.takeIf { it.isNotBlank() } ?: "CleanTube"
        val safeChannel = channel?.takeIf { it.isNotBlank() } ?: "YouTube"
        mainHandler.post { listener.onMediaStateUpdated(safeTitle, safeChannel, isPlaying) }
    }
}
