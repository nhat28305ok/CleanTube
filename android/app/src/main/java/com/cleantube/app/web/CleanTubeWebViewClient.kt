package com.cleantube.app.web

import android.content.Intent
import android.graphics.Bitmap
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import java.util.Locale

/**
 * WebViewClient enforcing ad request blocking, deep-link protection,
 * internal vs external navigation routing, and fallback userscript injection.
 */
class CleanTubeWebViewClient(
    private val adBlockFilter: AdBlockNetworkFilter,
    private val userscriptProvider: () -> String,
    private val useFallbackInjection: () -> Boolean,
    private val onPageLoadingChanged: (Boolean) -> Unit
) : WebViewClient() {

    override fun shouldInterceptRequest(
        view: WebView?,
        request: WebResourceRequest?
    ): WebResourceResponse? {
        if (adBlockFilter.shouldBlockUrl(request?.url?.toString())) {
            return WebResourceResponse(
                "text/plain",
                "utf-8",
                200,
                "OK",
                emptyMap(),
                ByteArrayInputStream(ByteArray(0))
            )
        }
        return super.shouldInterceptRequest(view, request)
    }

    override fun shouldOverrideUrlLoading(
        view: WebView?,
        request: WebResourceRequest?
    ): Boolean {
        val uri = request?.url ?: return false
        val rawUrl = uri.toString()
        if (rawUrl.isBlank()) {
            return false
        }

        val scheme = uri.scheme?.lowercase(Locale.ROOT).orEmpty()
        if (scheme == "vnd.youtube" || scheme == "intent") {
            return true
        }

        if (scheme == "http" || scheme == "https") {
            val host = uri.host?.lowercase(Locale.ROOT).orEmpty()
            if (isInternalHost(host)) {
                return false
            }
            val context = view?.context
            if (context != null) {
                try {
                    context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                } catch (_: Exception) {
                    // Ignore missing browser activity or malformed intent targets.
                }
            }
            return true
        }

        return super.shouldOverrideUrlLoading(view, request)
    }

    override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
        super.onPageStarted(view, url, favicon)
        onPageLoadingChanged(true)
        if (useFallbackInjection() && view != null) {
            val script = userscriptProvider()
            if (script.isNotBlank()) {
                view.evaluateJavascript(script, null)
            }
        }
    }

    override fun onPageFinished(view: WebView?, url: String?) {
        super.onPageFinished(view, url)
        onPageLoadingChanged(false)
    }

    private fun isInternalHost(host: String): Boolean {
        if (host.isBlank()) return false
        if (host == "youtube.com" || host.endsWith(".youtube.com") || host == "youtu.be") {
            return true
        }
        return host in GOOGLE_AUTH_HOSTS
    }

    private companion object {
        val GOOGLE_AUTH_HOSTS = setOf(
            "accounts.google.com",
            "accounts.youtube.com",
            "myaccount.google.com",
            "g.co"
        )
    }
}
