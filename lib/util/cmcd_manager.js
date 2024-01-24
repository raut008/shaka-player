/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.CmcdManager');

goog.require('goog.Uri');
goog.require('shaka.log');
goog.require('shaka.net.NetworkingEngine');

/**
 * @summary
 * A CmcdManager maintains CMCD state as well as a collection of utility
 * functions.
 *
 * @suppress {undefinedVars}
 * @suppress {missingProperties}
 */
shaka.util.CmcdManager = class {
  /**
   * @param {shaka.util.CmcdManager.PlayerInterface} playerInterface
   * @param {shaka.extern.CmcdConfiguration} config
   */
  constructor(playerInterface, config) {
    /** @private {shaka.util.CmcdManager.PlayerInterface} */
    this.playerInterface_ = playerInterface;

    /** @private {?shaka.extern.CmcdConfiguration} */
    this.config_ = config;

    /**
     * Session ID
     *
     * @private {string}
     */
    this.sid_ = '';

    /**
     * Streaming format
     *
     * @private {(string|undefined)}
     */
    this.sf_ = undefined;

    /**
     * @private {boolean}
     */
    this.playbackStarted_ = false;

    /**
    * @private {boolean}
    */
    this.buffering_ = true;

    /**
     * @private {boolean}
     */
    this.starved_ = false;
  }

  /**
   * Called by the Player to provide an updated configuration any time it
   * changes.
   *
   * @param {shaka.extern.CmcdConfiguration} config
   */
  configure(config) {
    this.config_ = config;
  }

  /**
   * Set the buffering state
   *
   * @param {boolean} buffering
   */
  setBuffering(buffering) {
    if (!buffering && !this.playbackStarted_) {
      this.playbackStarted_ = true;
    }

    if (this.playbackStarted_ && buffering) {
      this.starved_ = true;
    }

    this.buffering_ = buffering;
  }

  /**
   * Apply CMCD data to a request.
   *
   * @param {!shaka.net.NetworkingEngine.RequestType} type
   *   The request type
   * @param {!shaka.extern.Request} request
   *   The request to apply CMCD data to
   * @param {shaka.extern.RequestContext=} context
   *   The request context
   */
  applyData(type, request, context = {}) {
    if (!this.config_.enabled) {
      return;
    }

    if (request.method === 'HEAD') {
      this.apply_(request);
      return;
    }

    const RequestType = shaka.net.NetworkingEngine.RequestType;

    switch (type) {
      case RequestType.MANIFEST:
        this.applyManifestData(request, context);
        break;

      case RequestType.SEGMENT:
        this.applySegmentData(request, context);
        break;

      case RequestType.LICENSE:
      case RequestType.SERVER_CERTIFICATE:
      case RequestType.KEY:
        this.apply_(request, {ot: CmcdObjectType.KEY});
        break;

      case RequestType.TIMING:
        this.apply_(request, {ot: CmcdObjectType.OTHER});
        break;
    }
  }

  /**
   * Apply CMCD data to a manifest request.
   *
   * @param {!shaka.extern.Request} request
   *   The request to apply CMCD data to
   * @param {shaka.extern.RequestContext} context
   *   The request context
   */
  applyManifestData(request, context) {
    try {
      if (!this.config_.enabled) {
        return;
      }

      if (context.type) {
        this.sf_ = this.getStreamFormat_(context.type);
      }

      this.apply_(request, {
        ot: CmcdObjectType.MANIFEST,
        su: !this.playbackStarted_,
      });
    } catch (error) {
      shaka.log.warnOnce('CMCD_MANIFEST_ERROR',
          'Could not generate manifest CMCD data.', error);
    }
  }

  /**
   * Apply CMCD data to a segment request
   *
   * @param {!shaka.extern.Request} request
   * @param {shaka.extern.RequestContext} context
   *   The request context
   */
  applySegmentData(request, context) {
    try {
      if (!this.config_.enabled) {
        return;
      }

      const segment = context.segment;

      let duration = 0;
      if (segment) {
        duration = segment.endTime - segment.startTime;
      }

      const data = {
        d: duration * 1000,
        st: this.getStreamType_(),
      };

      data.ot = this.getObjectType_(context);

      const isMedia = data.ot === CmcdObjectType.VIDEO ||
          data.ot === CmcdObjectType.AUDIO ||
          data.ot === CmcdObjectType.MUXED ||
          data.ot === CmcdObjectType.TIMED_TEXT;

      const stream = context.stream;
      if (stream) {
        if (isMedia) {
          data.bl = this.getBufferLength_(stream.type);
        }

        if (stream.bandwidth) {
          data.br = stream.bandwidth / 1000;
        }
      }

      if (isMedia && data.ot !== CmcdObjectType.TIMED_TEXT) {
        data.tb = this.getTopBandwidth_(data.ot) / 1000;
      }

      this.apply_(request, data);
    } catch (error) {
      shaka.log.warnOnce('CMCD_SEGMENT_ERROR',
          'Could not generate segment CMCD data.', error);
    }
  }

  /**
   * Apply CMCD data to a text request
   *
   * @param {!shaka.extern.Request} request
   */
  applyTextData(request) {
    try {
      if (!this.config_.enabled) {
        return;
      }

      this.apply_(request, {
        ot: CmcdObjectType.CAPTION,
        su: true,
      });
    } catch (error) {
      shaka.log.warnOnce('CMCD_TEXT_ERROR',
          'Could not generate text CMCD data.', error);
    }
  }

  /**
   * Apply CMCD data to streams loaded via src=.
   *
   * @param {string} uri
   * @param {string} mimeType
   * @return {string}
   */
  appendSrcData(uri, mimeType) {
    try {
      if (!this.config_.enabled) {
        return uri;
      }

      const data = this.createData_();
      data.ot = this.getObjectTypeFromMimeType_(mimeType);
      data.su = true;

      const query = shaka.util.CmcdManager.toQuery(data);

      return shaka.util.CmcdManager.appendQueryToUri(uri, query);
    } catch (error) {
      shaka.log.warnOnce('CMCD_SRC_ERROR',
          'Could not generate src CMCD data.', error);
      return uri;
    }
  }

  /**
   * Apply CMCD data to side car text track uri.
   *
   * @param {string} uri
   * @return {string}
   */
  appendTextTrackData(uri) {
    try {
      if (!this.config_.enabled) {
        return uri;
      }

      const data = this.createData_();
      data.ot = CmcdObjectType.CAPTION;
      data.su = true;

      const query = shaka.util.CmcdManager.toQuery(data);

      return shaka.util.CmcdManager.appendQueryToUri(uri, query);
    } catch (error) {
      shaka.log.warnOnce('CMCD_TEXT_TRACK_ERROR',
          'Could not generate text track CMCD data.', error);
      return uri;
    }
  }

  /**
   * Create baseline CMCD data
   *
   * @return {CmcdData}
   * @private
   */
  createData_() {
    if (!this.sid_) {
      this.sid_ = this.config_.sessionId || window.crypto.randomUUID();
    }
    return {
      v: CMCD_V1,
      sf: this.sf_,
      sid: this.sid_,
      cid: this.config_.contentId,
      mtp: this.playerInterface_.getBandwidthEstimate() / 1000,
    };
  }

  /**
   * Apply CMCD data to a request.
   *
   * @param {!shaka.extern.Request} request The request to apply CMCD data to
   * @param {!CmcdData} data The data object
   * @param {boolean} useHeaders Send data via request headers
   * @private
   */
  apply_(request, data = {}, useHeaders = this.config_.useHeaders) {
    if (!this.config_.enabled) {
      return;
    }

    // apply baseline data
    Object.assign(data, this.createData_());

    data.pr = this.playerInterface_.getPlaybackRate();

    const isVideo = data.ot === CmcdObjectType.VIDEO ||
        data.ot === CmcdObjectType.MUXED;

    if (this.starved_ && isVideo) {
      data.bs = true;
      data.su = true;
      this.starved_ = false;
    }

    if (data.su == null) {
      data.su = this.buffering_;
    }

    // TODO: Implement rtp, nrr, nor, dl

    if (useHeaders) {
      const headers = shaka.util.CmcdManager.toHeaders(data);
      if (!Object.keys(headers).length) {
        return;
      }

      Object.assign(request.headers, headers);
    } else {
      const query = shaka.util.CmcdManager.toQuery(data);
      if (!query) {
        return;
      }

      request.uris = request.uris.map((uri) => {
        return shaka.util.CmcdManager.appendQueryToUri(uri, query);
      });
    }
  }

  /**
   * The CMCD object type.
   *
   * @param {shaka.extern.RequestContext} context
   *   The request context
   * @private
   */
  getObjectType_(context) {
    if (context.type ===
        shaka.net.NetworkingEngine.AdvancedRequestType.INIT_SEGMENT) {
      return CmcdObjectType.INIT;
    }

    const stream = context.stream;

    if (!stream) {
      return undefined;
    }

    const type = stream.type;

    if (type == 'video') {
      if (stream.codecs && stream.codecs.includes(',')) {
        return CmcdObjectType.MUXED;
      }
      return CmcdObjectType.VIDEO;
    }

    if (type == 'audio') {
      return CmcdObjectType.AUDIO;
    }

    if (type == 'text') {
      if (stream.mimeType === 'application/mp4') {
        return CmcdObjectType.TIMED_TEXT;
      }
      return CmcdObjectType.CAPTION;
    }

    return undefined;
  }

  /**
   * The CMCD object type from mimeType.
   *
   * @param {!string} mimeType
   * @return {(string|undefined)}
   * @private
   */
  getObjectTypeFromMimeType_(mimeType) {
    switch (mimeType.toLowerCase()) {
      case 'video/webm':
      case 'video/mp4':
      case 'video/mpeg':
      case 'video/mp2t':
        return CmcdObjectType.MUXED;

      case 'application/x-mpegurl':
      case 'application/vnd.apple.mpegurl':
      case 'application/dash+xml':
      case 'video/vnd.mpeg.dash.mpd':
        return CmcdObjectType.MANIFEST;

      default:
        return undefined;
    }
  }

  /**
   * Get the buffer length for a media type in milliseconds
   *
   * @param {string} type
   * @return {number}
   * @private
   */
  getBufferLength_(type) {
    const ranges = this.playerInterface_.getBufferedInfo()[type];

    if (!ranges.length) {
      return NaN;
    }

    const start = this.playerInterface_.getCurrentTime();
    const range = ranges.find((r) => r.start <= start && r.end >= start);

    if (!range) {
      return NaN;
    }

    return (range.end - start) * 1000;
  }

  /**
   * Get the stream format
   *
   * @param {shaka.net.NetworkingEngine.AdvancedRequestType} type
   *   The request's advanced type
   * @return {(string|undefined)}
   * @private
   */
  getStreamFormat_(type) {
    const AdvancedRequestType = shaka.net.NetworkingEngine.AdvancedRequestType;

    switch (type) {
      case AdvancedRequestType.MPD:
        return CmcdStreamingFormat.DASH;

      case AdvancedRequestType.MASTER_PLAYLIST:
      case AdvancedRequestType.MEDIA_PLAYLIST:
        return CmcdStreamingFormat.HLS;

      case AdvancedRequestType.MSS:
        return CmcdStreamingFormat.SMOOTH;
    }

    return undefined;
  }

  /**
   * Get the stream type
   *
   * @return {string}
   * @private
   */
  getStreamType_() {
    const isLive = this.playerInterface_.isLive();
    if (isLive) {
      return CmcdStreamType.LIVE;
    } else {
      return CmcdStreamType.VOD;
    }
  }

  /**
   * Get the highest bandwidth for a given type.
   *
   * @param {string} type
   * @return {number}
   * @private
   */
  getTopBandwidth_(type) {
    const variants = this.playerInterface_.getVariantTracks();
    if (!variants.length) {
      return NaN;
    }

    let top = variants[0];

    for (const variant of variants) {
      if (variant.type === 'variant' && variant.bandwidth > top.bandwidth) {
        top = variant;
      }
    }

    const ObjectType = CmcdObjectType;

    switch (type) {
      case ObjectType.VIDEO:
        return top.videoBandwidth || NaN;

      case ObjectType.AUDIO:
        return top.audioBandwidth || NaN;

      default:
        return top.bandwidth;
    }
  }

  /**
   * Serialize a CMCD data object according to the rules defined in the
   * section 3.2 of
   * [CTA-5004](https://cdn.cta.tech/cta/media/media/resources/standards/pdfs/cta-5004-final.pdf).
   *
   * @param {CmcdData} data The CMCD data object
   * @return {string}
   */
  static serialize(data) {
    return encodeCmcd(data);
  }

  /**
   * Convert a CMCD data object to request headers according to the rules
   * defined in the section 2.1 and 3.2 of
   * [CTA-5004](https://cdn.cta.tech/cta/media/media/resources/standards/pdfs/cta-5004-final.pdf).
   *
   * @param {CmcdData} data The CMCD data object
   * @return {!Object}
   */
  static toHeaders(data) {
    const keys = Object.keys(data);
    const headers = {};
    const headerNames = ['Object', 'Request', 'Session', 'Status'];
    const headerGroups = [{}, {}, {}, {}];
    const headerMap = {
      br: 0, d: 0, ot: 0, tb: 0,
      bl: 1, dl: 1, mtp: 1, nor: 1, nrr: 1, su: 1,
      cid: 2, pr: 2, sf: 2, sid: 2, st: 2, v: 2,
      bs: 3, rtp: 3,
    };

    for (const key of keys) {
      // Unmapped fields are mapped to the Request header
      const index = (headerMap[key] != null) ? headerMap[key] : 1;
      headerGroups[index][key] = data[key];
    }

    for (let i = 0; i < headerGroups.length; i++) {
      const value = shaka.util.CmcdManager.serialize(headerGroups[i]);
      if (value) {
        headers[`CMCD-${headerNames[i]}`] = value;
      }
    }

    return headers;
  }

  /**
   * Convert a CMCD data object to query args according to the rules
   * defined in the section 2.2 and 3.2 of
   * [CTA-5004](https://cdn.cta.tech/cta/media/media/resources/standards/pdfs/cta-5004-final.pdf).
   *
   * @param {CmcdData} data The CMCD data object
   * @return {string}
   */
  static toQuery(data) {
    return shaka.util.CmcdManager.serialize(data);
  }

  /**
   * Append query args to a uri.
   *
   * @param {string} uri
   * @param {string} query
   * @return {string}
   */
  static appendQueryToUri(uri, query) {
    if (!query) {
      return uri;
    }

    if (uri.includes('offline:')) {
      return uri;
    }

    const url = new goog.Uri(uri);
    url.getQueryData().set('CMCD', query);
    return url.toString();
  }
};


/**
 * @typedef {{
 *   getBandwidthEstimate: function():number,
 *   getBufferedInfo: function():shaka.extern.BufferedInfo,
 *   getCurrentTime: function():number,
 *   getPlaybackRate: function():number,
 *   getVariantTracks: function():Array.<shaka.extern.Track>,
 *   isLive: function():boolean
 * }}
 *
 * @property {function():number} getBandwidthEstimate
 *   Get the estimated bandwidth in bits per second.
 * @property {function():shaka.extern.BufferedInfo} getBufferedInfo
 *   Get information about what the player has buffered.
 * @property {function():number} getCurrentTime
 *   Get the current time
 * @property {function():number} getPlaybackRate
 *   Get the playback rate
 * @property {function():Array.<shaka.extern.Track>} getVariantTracks
 *   Get the variant tracks
 * @property {function():boolean} isLive
 *   Get if the player is playing live content.
 */
shaka.util.CmcdManager.PlayerInterface;
