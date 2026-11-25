package com.cleantube.app.web

import java.net.URI
import java.net.URISyntaxException
import java.util.Locale

/**
 * Pure-JVM HTTP/HTTPS network filter for blocking YouTube and Google ad endpoints
 * while preserving core video streams, auth, SponsorBlock, and InnerTube API traffic.
 */
class AdBlockNetworkFilter(
    @Volatile var enabled: Boolean = true
) {

    fun shouldBlockUrl(url: String?): Boolean {
        if (!enabled || url.isNullOrBlank()) {
            return false
        }

        val uri = try {
            URI(url.trim())
        } catch (_: URISyntaxException) {
            return false
        } catch (_: IllegalArgumentException) {
            return false
        }

        val host = uri.host?.lowercase(Locale.ROOT)?.takeIf { it.isNotBlank() } ?: return false
        val path = uri.rawPath?.lowercase(Locale.ROOT).orEmpty()
        val query = uri.rawQuery?.lowercase(Locale.ROOT).orEmpty()

        if (isExplicitlyAllowed(host, path)) {
            return false
        }

        if (matchesAnyDomain(host, AD_HOSTS)) {
            return true
        }

        if (matchesAnyDomain(host, YOUTUBE_HOSTS) && isYouTubeAdPath(path, query)) {
            return true
        }

        return false
    }

    private fun isExplicitlyAllowed(host: String, path: String): Boolean {
        if (matchesAnyDomain(host, NEVER_BLOCK_HOSTS)) {
            return true
        }
        return NEVER_BLOCK_PATH_PREFIXES.any { prefix -> path.startsWith(prefix) }
    }

    private fun isYouTubeAdPath(path: String, query: String): Boolean {
        if (YOUTUBE_AD_PATH_PREFIXES.any { prefix -> path.startsWith(prefix) }) {
            return true
        }
        if (path == "/get_video_info" || path.startsWith("/get_video_info/")) {
            return query.contains("adformat=") || query.contains("ad_type=")
        }
        return false
    }

    private fun matchesAnyDomain(host: String, domains: Set<String>): Boolean {
        return domains.any { domain -> host == domain || host.endsWith(".$domain") }
    }

    private companion object {
        val AD_HOSTS = setOf(
            "doubleclick.net",
            "googlesyndication.com",
            "googleadservices.com",
            "adservice.google.com",
            "2mdn.net",
            "ads.youtube.com",
            "pagead2.googlesyndication.com",
            "tpc.googlesyndication.com"
        )

        val YOUTUBE_HOSTS = setOf(
            "youtube.com",
            "m.youtube.com",
            "www.youtube.com",
            "youtube-nocookie.com"
        )

        val YOUTUBE_AD_PATH_PREFIXES = listOf(
            "/pagead/",
            "/api/stats/ads",
            "/ptracking",
            "/get_midroll_info"
        )

        val NEVER_BLOCK_HOSTS = setOf(
            "googlevideo.com",
            "ytimg.com",
            "ggpht.com",
            "accounts.google.com",
            "sponsor.ajay.app"
        )

        val NEVER_BLOCK_PATH_PREFIXES = listOf(
            "/youtubei/v1/player",
            "/youtubei/v1/next",
            "/youtubei/v1/browse",
            "/youtubei/v1/search"
        )
    }
}
