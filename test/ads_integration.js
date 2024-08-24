/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Ads', () => {
  const Util = shaka.test.Util;

  /** @type {!jasmine.Spy} */
  let onErrorSpy;

  /** @type {!jasmine.Spy} */
  let onAdErrorSpy;

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!HTMLElement} */
  let adContainer;
  /** @type {shaka.Player} */
  let player;
  /** @type {shaka.extern.IAdManager} */
  let adManager;
  /** @type {!shaka.util.EventManager} */
  let eventManager;

  let compiledShaka;

  /** @type {!shaka.test.Waiter} */
  let waiter;

  /** @type {string} */
  const vastUri = 'https://pubads.g.doubleclick.net/gampad/ads?' +
      'sz=640x480&iu=/124319096/external/single_ad_samples&' +
      'ciu_szs=300x250&impl=s&gdfp_req=1&env=vp&output=vast&' +
      'unviewed_position_start=1&' +
      'cust_params=deployment%3Ddevsite%26sample_ct%3Dlinear&correlator=';

  /** @type {string} */
  const vmapUri = 'https://pubads.g.doubleclick.net/gampad/ads?' +
      'iu=/21775744923/external/vmap_ad_samples&sz=640x480&' +
      'cust_params=sample_ar%3Dpreonly&ciu_szs=300x250%2C728x90&gdfp_req=1&' +
      'ad_rule=1&output=vmap&unviewed_position_start=1&' +
      'env=vp&impl=s&correlator=';

  beforeAll(async () => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
    adContainer =
      /** @type {!HTMLElement} */ (document.createElement('div'));
    adContainer.style.position = 'relative';
    adContainer.style.width = '600px';
    adContainer.style.height = '400px';
    document.body.appendChild(adContainer);
    compiledShaka =
        await shaka.test.Loader.loadShaka(getClientArg('uncompiled'));
  });

  beforeEach(async () => {
    await shaka.test.TestScheme.createManifests(compiledShaka, '_compiled');
    player = new compiledShaka.Player();
    adManager = player.getAdManager();
    await player.attach(video);

    // Disable stall detection, which can interfere with playback tests.
    player.configure('streaming.stallEnabled', false);

    // Grab event manager from the uncompiled library:
    eventManager = new shaka.util.EventManager();
    waiter = new shaka.test.Waiter(eventManager);
    waiter.setPlayer(player);

    onErrorSpy = jasmine.createSpy('onError');
    onErrorSpy.and.callFake((event) => {
      fail(event.detail);
    });
    eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));

    onAdErrorSpy = jasmine.createSpy('onAdError');
    onAdErrorSpy.and.callFake((event) => {
      if (!event['originalEvent']) {
        fail(event);
        return;
      }
      if (event['originalEvent'] instanceof shaka.util.Error) {
        fail(event['originalEvent']);
        return;
      }
      const imaEvent =
      /** @type {!google.ima.AdErrorEvent} */ (event['originalEvent']);
      fail(imaEvent.getError());
    });
    eventManager.listen(adManager, shaka.ads.Utils.AD_ERROR,
        Util.spyFunc(onAdErrorSpy));
  });

  afterEach(async () => {
    eventManager.release();
    await player.destroy();
  });

  afterAll(() => {
    document.body.removeChild(video);
    document.body.removeChild(adContainer);
  });

  // IMA tests are failing in GitHub Actions
  xdescribe('supports IMA SDK with vast', () => {
    /** @type {string} */
    const streamUri = '/base/test/test/assets/dash-multi-codec/dash.mpd';

    it('with support for multiple media elements', async () => {
      if (shaka.util.Platform.isSmartTV()) {
        pending('Platform without support for multiple media elements.');
      }
      player.configure('ads.customPlayheadTracker', false);
      player.configure('ads.skipPlayDetection', false);
      player.configure('ads.supportsMultipleMediaElements', true);

      adManager.initClientSide(
          adContainer, video, /** adsRenderingSettings= **/ null);

      await player.load(streamUri);
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 5 seconds, but stop early if the video ends.  If it takes
      // longer than 20 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 5, 20);

      const adRequest = new google.ima.AdsRequest();
      adRequest.adTagUrl = vastUri;
      adManager.requestClientSideAds(adRequest);

      // Wait a maximum of 10 seconds before the ad starts playing.
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_FIRST_QUARTILE);
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_MIDPOINT);
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_THIRD_QUARTILE);
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STOPPED);

      // Play for 10 seconds, but stop early if the video ends.  If it takes
      // longer than 30 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 30);

      await player.unload();
    });

    it('without support for multiple media elements', async () => {
      player.configure('ads.customPlayheadTracker', true);
      player.configure('ads.skipPlayDetection', true);
      player.configure('ads.supportsMultipleMediaElements', false);

      adManager.initClientSide(
          adContainer, video, /** adsRenderingSettings= **/ null);

      await player.load(streamUri);
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 5 seconds, but stop early if the video ends.  If it takes
      // longer than 20 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 5, 20);

      const adRequest = new google.ima.AdsRequest();
      adRequest.adTagUrl = vastUri;
      adManager.requestClientSideAds(adRequest);

      // Wait a maximum of 10 seconds before the ad starts playing.
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_FIRST_QUARTILE);
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_MIDPOINT);
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_THIRD_QUARTILE);
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STOPPED);

      // Play for 10 seconds, but stop early if the video ends.  If it takes
      // longer than 30 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 30);

      await player.unload();
    });
  });

  describe('support HLS Interstitials', () => {
    /** @type {string} */
    const streamUri = '/base/test/test/assets/hls-interstitial/main.m3u8';

    it('with support for multiple media elements', async () => {
      if (shaka.util.Platform.isSmartTV()) {
        pending('Platform without support for multiple media elements.');
      }
      player.configure('ads.supportsMultipleMediaElements', true);

      adManager.initInterstitial(adContainer, player, video);

      await player.load(streamUri);
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait a maximum of 10 seconds before the ad starts playing.
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);
      await waiter.timeoutAfter(20)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STOPPED);

      await shaka.test.Util.delay(1);
      expect(video.currentTime).toBeLessThanOrEqual(3);

      // Wait a maximum of 10 seconds before the ad starts playing.
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);
      await waiter.timeoutAfter(20)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STOPPED);

      await shaka.test.Util.delay(1);
      expect(video.currentTime).toBeGreaterThan(8);

      // Play for 10 seconds, but stop early if the video ends.  If it takes
      // longer than 30 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 30);

      await player.unload();
    });

    it('without support for multiple media elements', async () => {
      player.configure('ads.supportsMultipleMediaElements', false);

      adManager.initInterstitial(adContainer, player, video);

      await player.load(streamUri);
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait a maximum of 10 seconds before the ad starts playing.
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);
      await waiter.timeoutAfter(20)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STOPPED);

      await shaka.test.Util.delay(1);
      expect(video.currentTime).toBeLessThanOrEqual(3);

      // Wait a maximum of 10 seconds before the ad starts playing.
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);
      await waiter.timeoutAfter(20)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STOPPED);

      await shaka.test.Util.delay(1);
      expect(video.currentTime).toBeGreaterThan(8);

      // Play for 10 seconds, but stop early if the video ends.  If it takes
      // longer than 30 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 30);

      await player.unload();
    });

    it('using the main media element', async () => {
      goog.asserts.assert(adManager, 'Must have adManager');

      await player.load(streamUri);
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait a maximum of 10 seconds before the ad starts playing.
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);
      await waiter.timeoutAfter(20)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STOPPED);

      await shaka.test.Util.delay(1);
      expect(video.currentTime).toBeLessThanOrEqual(3);

      // Wait a maximum of 10 seconds before the ad starts playing.
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);
      await waiter.timeoutAfter(20)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STOPPED);

      // Play for 10 seconds, but stop early if the video ends.  If it takes
      // longer than 30 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 30);

      await player.unload();
    });
  });

  describe('support VAST using Interstitials API', () => {
    /** @type {string} */
    const streamUri = '/base/test/test/assets/dash-multi-codec/dash.mpd';

    it('without support for multiple media elements', async () => {
      player.configure('ads.supportsMultipleMediaElements', false);

      adManager.initInterstitial(adContainer, player, video);

      await player.load(streamUri);
      await video.play();
      expect(player.isLive()).toBe(false);

      adManager.addAdUrlInterstitial(vastUri);

      // Wait a maximum of 10 seconds before the ad starts playing.
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);
      await waiter.timeoutAfter(20)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STOPPED);

      await shaka.test.Util.delay(1);
      expect(video.currentTime).toBeLessThanOrEqual(3);

      // Play for 5 seconds, but stop early if the video ends.  If it takes
      // longer than 30 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 5, 30);

      await player.unload();
    });
  });

  describe('support VMAP using Interstitials API', () => {
    /** @type {string} */
    const streamUri = '/base/test/test/assets/dash-multi-codec/dash.mpd';

    it('without support for multiple media elements', async () => {
      player.configure('ads.supportsMultipleMediaElements', false);

      adManager.initInterstitial(adContainer, player, video);

      await player.load(streamUri);
      await video.play();
      expect(player.isLive()).toBe(false);

      adManager.addAdUrlInterstitial(vmapUri);

      // Wait a maximum of 10 seconds before the ad starts playing.
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);
      await waiter.timeoutAfter(20)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STOPPED);

      await shaka.test.Util.delay(1);
      expect(video.currentTime).toBeLessThanOrEqual(3);

      // Play for 5 seconds, but stop early if the video ends.  If it takes
      // longer than 30 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 5, 30);

      await player.unload();
    });
  });

  describe('support MPD Alternate', () => {
    /** @type {string} */
    const streamUri = '/base/test/test/assets/dash-mpd-alternate/dash.mpd';

    it('without support for multiple media elements', async () => {
      player.configure('ads.supportsMultipleMediaElements', false);

      adManager.initInterstitial(adContainer, player, video);

      await player.load(streamUri);
      await video.play();
      expect(player.isLive()).toBe(false);

      // Wait a maximum of 10 seconds before the ad starts playing.
      await waiter.timeoutAfter(10)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);
      await waiter.timeoutAfter(20)
          .waitForEvent(adManager, shaka.ads.Utils.AD_STOPPED);

      // Play for 5 seconds, but stop early if the video ends.  If it takes
      // longer than 30 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 5, 30);

      await player.unload();
    });
  });
});
