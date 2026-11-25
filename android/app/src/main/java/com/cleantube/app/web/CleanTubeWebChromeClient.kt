package com.cleantube.app.web

import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebView

/**
 * WebChromeClient forwarding HTML5 fullscreen video transitions and page load progress.
 */
class CleanTubeWebChromeClient(
    private val onEnterFullscreen: (View, CustomViewCallback) -> Unit,
    private val onExitFullscreen: () -> Unit,
    private val onProgressChangedCallback: (Int) -> Unit
) : WebChromeClient() {

    override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
        if (view != null && callback != null) {
            onEnterFullscreen(view, callback)
        } else {
            callback?.onCustomViewHidden()
        }
    }

    override fun onHideCustomView() {
        onExitFullscreen()
    }

    override fun onProgressChanged(view: WebView?, newProgress: Int) {
        super.onProgressChanged(view, newProgress)
        onProgressChangedCallback(newProgress)
    }
}
