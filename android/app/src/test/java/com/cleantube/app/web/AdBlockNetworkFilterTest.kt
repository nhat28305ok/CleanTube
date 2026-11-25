package com.cleantube.app.web

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AdBlockNetworkFilterTest {

    @Test
    fun blocksKnownAdHostsAndSubdomains() {
        val filter = AdBlockNetworkFilter()

        assertTrue(filter.shouldBlockUrl("https://doubleclick.net/pixel"))
        assertTrue(filter.shouldBlockUrl("https://ad.doubleclick.net/ddm/activity"))
        assertTrue(filter.shouldBlockUrl("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"))
        assertTrue(filter.shouldBlockUrl("https://ads.youtube.com/pagead/viewthroughconversion"))
        assertTrue(filter.shouldBlockUrl("https://googleadservices.com/pagead/conversion.js"))
        assertTrue(filter.shouldBlockUrl("https://adservice.google.com/adsid/integrator.js"))
        assertTrue(filter.shouldBlockUrl("https://s0.2mdn.net/ads/richmedia/studio/pv2/creative.js"))
        assertTrue(filter.shouldBlockUrl("https://tpc.googlesyndication.com/simgad/12345"))
    }

    @Test
    fun blocksYouTubeAdPathsAndAdVideoInfo() {
        val filter = AdBlockNetworkFilter()

        assertTrue(filter.shouldBlockUrl("https://m.youtube.com/pagead/lvz?foo=1"))
        assertTrue(filter.shouldBlockUrl("https://www.youtube.com/api/stats/ads?ns=yt"))
        assertTrue(filter.shouldBlockUrl("https://youtube.com/ptracking?video_id=abc"))
        assertTrue(filter.shouldBlockUrl("https://www.youtube-nocookie.com/get_midroll_info?v=abc"))
        assertTrue(filter.shouldBlockUrl("https://www.youtube.com/get_video_info?adformat=1&v=abc"))
        assertTrue(filter.shouldBlockUrl("https://m.youtube.com/get_video_info?v=abc&ad_type=vast"))
    }

    @Test
    fun allowsCoreMediaAuthSponsorBlockAndInnerTubeEndpoints() {
        val filter = AdBlockNetworkFilter()

        assertFalse(filter.shouldBlockUrl("https://rr3---sn-4g5e6ns7.googlevideo.com/videoplayback?id=123"))
        assertFalse(filter.shouldBlockUrl("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"))
        assertFalse(filter.shouldBlockUrl("https://yt3.ggpht.com/ytc/avatar.jpg"))
        assertFalse(filter.shouldBlockUrl("https://accounts.google.com/ServiceLogin"))
        assertFalse(filter.shouldBlockUrl("https://sponsor.ajay.app/api/skipSegments?videoID=abc"))
        assertFalse(filter.shouldBlockUrl("https://m.youtube.com/youtubei/v1/player?prettyPrint=false"))
        assertFalse(filter.shouldBlockUrl("https://www.youtube.com/youtubei/v1/next"))
        assertFalse(filter.shouldBlockUrl("https://www.youtube.com/youtubei/v1/browse"))
        assertFalse(filter.shouldBlockUrl("https://www.youtube.com/youtubei/v1/search"))
        assertFalse(filter.shouldBlockUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ"))
        assertFalse(filter.shouldBlockUrl("https://www.youtube.com/get_video_info?video_id=dQw4w9WgXcQ"))
    }

    @Test
    fun respectsDisabledFlagAndHandlesNullBlankOrMalformedUrlsSafely() {
        val filter = AdBlockNetworkFilter(enabled = false)

        assertFalse(filter.shouldBlockUrl("https://doubleclick.net/pixel"))
        assertFalse(filter.shouldBlockUrl("https://m.youtube.com/pagead/lvz"))

        filter.enabled = true
        assertFalse(filter.shouldBlockUrl(null))
        assertFalse(filter.shouldBlockUrl(""))
        assertFalse(filter.shouldBlockUrl("   "))
        assertFalse(filter.shouldBlockUrl("http://exa mple.com/bad path"))
        assertFalse(filter.shouldBlockUrl("://missing-scheme"))
    }
}
