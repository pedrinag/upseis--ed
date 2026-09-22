(function() {
  function initializeUpsellDelaySupport() {
    const delayAttribute = 'data-kashpay-upsell-delay';
    const delaySupportAttribute = 'data-kashpay-upsell-delay-support';
    const delaySupportScript = document.currentScript;

    // A tag historica nao possui o opt-in. Nesse caso nao ha observer,
    // varredura do DOM ou qualquer alteracao nos botoes existentes.
    if (
      !delaySupportScript ||
      typeof delaySupportScript.hasAttribute !== 'function' ||
      !delaySupportScript.hasAttribute(delaySupportAttribute)
    ) return;

    let scheduledElements;
    let trackedElements;
    try {
      scheduledElements = new WeakMap();
      trackedElements = new Set();
    } catch (_) {
      // Nenhum elemento foi alterado ainda; browsers sem essas primitivas
      // simplesmente mantem os CTAs visiveis e seguem com o asset legado.
      return;
    }

    function restoreElement(element, clearScheduledTimeout) {
      const state = scheduledElements.get(element);

      if (state) {
        if (clearScheduledTimeout && state.timeoutId !== undefined) {
          try {
            window.clearTimeout(state.timeoutId);
          } catch (_) {}
        }

        try {
          if (state.style) {
            if (state.hadInlineDisplay) {
              state.style.setProperty('display', state.displayValue, state.displayPriority);
            } else {
              state.style.removeProperty('display');
            }
          }
        } catch (_) {
          // Se a restauracao exata nao for suportada, priorize falhar aberto.
          try {
            if (state.style) state.style.removeProperty('display');
          } catch (_) {}
        }

        scheduledElements.delete(element);
        trackedElements.delete(element);
      }

      try {
        element.hidden = false;
      } catch (_) {}
    }

    function failOpenDelayedElements() {
      Array.from(trackedElements).forEach(function(element) {
        restoreElement(element, true);
      });

      try {
        const delayedElements = document.querySelectorAll('[' + delayAttribute + ']');
        for (let index = 0; index < delayedElements.length; index += 1) {
          restoreElement(delayedElements[index], true);
        }
      } catch (_) {}
    }

    try {
      const maxDelaySeconds = 86400;
      let observerStarted = false;
      const delayStartedAt = (
        typeof performance !== 'undefined' &&
        Number.isFinite(performance.timeOrigin)
      ) ? performance.timeOrigin : Date.now();

      function forEachDelayedElement(root, callback) {
        if (!root) return;

        if (
          root.nodeType === 1 &&
          typeof root.hasAttribute === 'function' &&
          root.hasAttribute(delayAttribute)
        ) {
          callback(root);
        }

        if (typeof root.querySelectorAll !== 'function') return;
        const elements = root.querySelectorAll('[' + delayAttribute + ']');
        for (let index = 0; index < elements.length; index += 1) {
          callback(elements[index]);
        }
      }

      function scheduleElement(element) {
        if (!element || scheduledElements.has(element)) return;

        const configuredDelay = Number(element.getAttribute(delayAttribute));
        const delaySeconds = Number.isFinite(configuredDelay)
          ? Math.min(maxDelaySeconds, Math.max(0, configuredDelay))
          : 0;
        const revealAt = delayStartedAt + (delaySeconds * 1000);
        const remainingDelay = Math.max(0, revealAt - Date.now());

        if (remainingDelay === 0) {
          restoreElement(element, true);
          return;
        }

        const style = (
          element.style &&
          typeof element.style.getPropertyValue === 'function' &&
          typeof element.style.getPropertyPriority === 'function' &&
          typeof element.style.setProperty === 'function' &&
          typeof element.style.removeProperty === 'function'
        ) ? element.style : null;
        const displayValue = style ? style.getPropertyValue('display') : '';
        const displayPriority = style ? style.getPropertyPriority('display') : '';
        const state = {
          timeoutId: undefined,
          style,
          displayValue,
          displayPriority,
          hadInlineDisplay: Boolean(displayValue || displayPriority)
        };

        scheduledElements.set(element, state);
        trackedElements.add(element);

        // `hidden` sozinho pode ser sobrescrito por display inline. Preserve o
        // valor original e force a ocultacao ate o prazo terminar.
        element.hidden = true;
        if (style) style.setProperty('display', 'none', 'important');
        state.timeoutId = window.setTimeout(function() {
          restoreElement(element, false);
        }, remainingDelay);
      }

      function cancelElement(element) {
        restoreElement(element, true);
      }

      function scheduleElements(root) {
        forEachDelayedElement(root, scheduleElement);
      }

      function cancelElements(root) {
        if (!root) return;
        Array.from(trackedElements).forEach(function(element) {
          if (
            element === root ||
            (typeof root.contains === 'function' && root.contains(element))
          ) {
            cancelElement(element);
          }
        });
      }

      function initializeDelayedElements() {
        scheduleElements(document);

        if (
          observerStarted ||
          !document.documentElement ||
          typeof MutationObserver === 'undefined'
        ) return;

        const observer = new MutationObserver(function(mutations) {
          try {
            for (let mutationIndex = 0; mutationIndex < mutations.length; mutationIndex += 1) {
              const mutation = mutations[mutationIndex];
              if (mutation.type === 'attributes') {
                cancelElement(mutation.target);
                if (mutation.target.hasAttribute(delayAttribute)) {
                  scheduleElement(mutation.target);
                }
                continue;
              }

              for (let index = 0; index < mutation.removedNodes.length; index += 1) {
                cancelElements(mutation.removedNodes[index]);
              }
              for (let index = 0; index < mutation.addedNodes.length; index += 1) {
                scheduleElements(mutation.addedNodes[index]);
              }
            }
          } catch (_) {
            failOpenDelayedElements();
          }
        });

        observerStarted = true;
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: [delayAttribute]
        });
      }

      initializeDelayedElements();
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeDelayedElements, { once: true });
      }
    } catch (_) {
      // Falha aberta: nunca deixe um CTA novo permanentemente oculto por erro
      // de compatibilidade do builder/navegador.
      failOpenDelayedElements();
    }
  }

  const translations = {
    pt: {
      processing: 'Processando sua compra...',
      success: 'Compra aprovada!',
      declined: 'Pagamento recusado',
      declinedMessage: 'Não foi possível processar este pagamento.',
      insufficientFunds: 'Seu cartão não possui saldo ou limite suficiente para esta oferta. Você pode continuar para a próxima etapa.',
      doNotHonor: 'O banco emissor não autorizou esta cobrança. Para evitar novas recusas, vamos finalizar seu pedido.',
      genericDecline: 'Seu banco recusou esta cobrança e não informou um motivo específico. Seu pedido principal segue confirmado.',
      authenticationRequired: 'Seu banco exigiu uma confirmação adicional e esta cobrança não foi aprovada. Seu pedido principal segue confirmado.',
      pending: 'Pagamento pendente',
      pendingMessage: 'O Stripe ainda esta confirmando este pagamento. Voce pode tentar novamente ou continuar para a proxima etapa.',
      whopPendingMessage: 'A cobranca ainda esta sendo processada. O pedido principal permanece confirmado; voce pode continuar para a proxima etapa.',
      tryAgain: 'Tentar Novamente',
      skip: 'Continuar'
    },
    en: {
      processing: 'Processing your purchase...',
      success: 'Purchase approved!',
      declined: 'Payment declined',
      declinedMessage: 'We could not process this payment.',
      insufficientFunds: 'Your card has insufficient funds or limit for this offer. You can continue to the next step.',
      doNotHonor: 'Your bank did not authorize this charge. To avoid more declines, we will finish your order.',
      genericDecline: 'Your bank declined this charge and did not provide a specific reason. Your main order is still confirmed.',
      authenticationRequired: 'Your bank required extra confirmation and this charge was not approved. Your main order is still confirmed.',
      pending: 'Payment pending',
      pendingMessage: 'Stripe is still confirming this payment. You can try again or continue to the next step.',
      whopPendingMessage: 'This charge is still being processed. Your main order remains confirmed; you can continue to the next step.',
      tryAgain: 'Try Again',
      skip: 'Continue'
    },
    es: {
      processing: 'Procesando tu compra...',
      success: 'Compra aprobada!',
      declined: 'Pago rechazado',
      declinedMessage: 'No pudimos procesar este pago.',
      insufficientFunds: 'Tu tarjeta no tiene saldo o límite suficiente para esta oferta. Puedes continuar al siguiente paso.',
      doNotHonor: 'Tu banco no autorizó este cobro. Para evitar nuevos rechazos, finalizaremos tu pedido.',
      genericDecline: 'Tu banco rechazó este cobro y no informó un motivo específico. Tu pedido principal sigue confirmado.',
      authenticationRequired: 'Tu banco solicitó una confirmación adicional y este cobro no fue aprobado. Tu pedido principal sigue confirmado.',
      pending: 'Pago pendiente',
      pendingMessage: 'Stripe todavia esta confirmando este pago. Puedes intentarlo de nuevo o continuar al siguiente paso.',
      whopPendingMessage: 'Este cobro todavia esta siendo procesado. Tu pedido principal sigue confirmado; puedes continuar al siguiente paso.',
      tryAgain: 'Intentar de nuevo',
      skip: 'Continuar'
    }
  };

  const INITIAL_SESSION_TOKEN_FALLBACK_MAX_AGE_MS = 30 * 60 * 1000;
  const SESSION_TOKEN_PATTERN = /^(?:[0-9a-f]{32}|[0-9a-f]{48})$/;

  function getSessionTokenState(url) {
    try {
      const values = new URL(url, window.location.href).searchParams.getAll('ks');
      if (values.length === 0) {
        return { present: false, valid: false, token: null, state: 'absent' };
      }
      if (values.length !== 1) {
        return { present: true, valid: false, token: null, state: 'duplicate' };
      }

      const token = values[0];
      if (!token) {
        return { present: true, valid: false, token: null, state: 'empty' };
      }
      if (!SESSION_TOKEN_PATTERN.test(token)) {
        return { present: true, valid: false, token: null, state: 'malformed' };
      }

      return { present: true, valid: true, token, state: 'valid' };
    } catch (_) {
      return { present: false, valid: false, token: null, state: 'unreadable_url' };
    }
  }

  const initialPageSessionContext = (() => {
    try {
      const initialUrl = new URL(window.location.href);
      const initialTokenState = getSessionTokenState(initialUrl.toString());
      return {
        token: initialTokenState.valid ? initialTokenState.token : null,
        tokenState: initialTokenState.state,
        origin: initialUrl.origin,
        path: initialUrl.pathname,
        capturedAt: Date.now()
      };
    } catch (_) {
      return {
        token: null,
        tokenState: 'unreadable_url',
        origin: null,
        path: null,
        capturedAt: Date.now()
      };
    }
  })();
  const initialPageStepPublicIds = new Set();
  const recoveredTokenTelemetryStepIds = new Set();

  function getLanguage() {
    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get('lang');
    if (langParam && translations[langParam]) {
      return translations[langParam];
    }
    // Fall back to browser language
    const browserLang = (navigator.language || '').toLowerCase().split('-')[0];
    return translations[browserLang] || translations.en;
  }

  function applyProcessingLayout(modal, content) {
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    content.style.cssText = `
      background: transparent;
      border-radius: 0;
      padding: 0;
      max-width: none;
      width: auto;
      text-align: center;
      box-shadow: none;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
  }

  function applyDialogLayout(modal, content) {
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    content.style.cssText = `
      background: white;
      border-radius: 16px;
      padding: 48px 32px;
      max-width: 400px;
      width: 90%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    `;
  }

  function createModal() {
    const modal = document.createElement('div');
    modal.id = 'kashpay-upsell-modal';

    const content = document.createElement('div');
    content.id = 'kashpay-modal-content';

    applyProcessingLayout(modal, content);

    modal.appendChild(content);
    document.body.appendChild(modal);
    return { modal, content };
  }

  function showSpinner(content, lang) {
    const modal = content.parentElement;
    if (modal) {
      applyProcessingLayout(modal, content);
    }

    content.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center;">
        <div style="
          width: 48px;
          height: 48px;
          border: 4px solid #e5e7eb;
          border-top-color: #01b44a;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        "></div>
      </div>
      <style>
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
    `;
  }

  function getFlowTraceId() {
    const key = 'kashpay_upsell_flow_trace_id';
    try {
      const existing = window.sessionStorage && window.sessionStorage.getItem(key);
      if (existing) return existing;
      const generated = 'up_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      if (window.sessionStorage) window.sessionStorage.setItem(key, generated);
      return generated;
    } catch (_) {
      return 'up_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    }
  }

  function getFrameContext() {
    try {
      return {
        isInIframe: window.self !== window.top,
        topAccessible: Boolean(window.top),
        topSameAsSelf: window.top === window.self
      };
    } catch (_) {
      return {
        isInIframe: true,
        topAccessible: false,
        topSameAsSelf: false
      };
    }
  }

  function showSuccess(content, lang, nextUrl) {
    const frameContext = getFrameContext();

    if (frameContext.isInIframe) {
      try {
        if (window.top) {
          window.top.location.href = nextUrl;
          setTimeout(function() {
            window.location.href = nextUrl;
          }, 400);
          return;
        }
      } catch (_) {
        // Fall back to navigating the current frame if top navigation is blocked.
      }
    }

    window.location.href = nextUrl;
  }

  function getQueryKeys(url) {
    try {
      return Array.from(new URL(url).searchParams.keys()).slice(0, 40);
    } catch (_) {
      return [];
    }
  }

  function getUrlParts(url) {
    try {
      const parsed = new URL(url, window.location.href);
      return {
        origin: parsed.origin,
        path: parsed.pathname,
        queryKeys: Array.from(parsed.searchParams.keys()).slice(0, 40),
        hasKs: parsed.searchParams.has('ks')
      };
    } catch (_) {
      return { origin: null, path: null, queryKeys: [], hasKs: false };
    }
  }

  function getReferrerOrigin() {
    try {
      return document.referrer ? new URL(document.referrer).origin : null;
    } catch (_) {
      return null;
    }
  }

  function collectStepPublicIdsFromPage() {
    const found = new Set();
    const patterns = [
      /acceptUpsell\(['"]([^'"]+)['"]\)/g,
      /declineUpsell\(['"]([^'"]+)['"]\)/g,
      /\/u\/([a-zA-Z0-9_-]+)/g
    ];

    const html = document.documentElement ? document.documentElement.innerHTML : '';
    patterns.forEach(function(pattern) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        try {
          const value = match[1] || '';
          if (value.indexOf('http') === 0) {
            const parsed = new URL(value);
            const id = parsed.pathname.split('/').filter(Boolean).pop();
            if (id) found.add(id);
          } else if (value) {
            found.add(value);
          }
        } catch (_) {}
      }
    });

    return Array.from(found).slice(0, 20);
  }

  function captureInitialPageStepPublicIds() {
    if (!initialPageSessionContext.token) return;

    const currentParts = getUrlParts(window.location.href);
    if (
      currentParts.origin !== initialPageSessionContext.origin ||
      currentParts.path !== initialPageSessionContext.path
    ) {
      return;
    }

    collectStepPublicIdsFromPage().forEach(function(stepPublicId) {
      initialPageStepPublicIds.add(stepPublicId);
    });
  }

  function resolveSessionTokenForAction(stepPublicId) {
    const currentTokenState = getSessionTokenState(window.location.href);
    if (currentTokenState.present) {
      if (currentTokenState.valid) {
        return {
          token: currentTokenState.token,
          source: 'current_url',
          ageMs: 0,
          currentTokenState: currentTokenState.state
        };
      }

      return {
        token: null,
        source: 'current_url_invalid',
        ageMs: 0,
        currentTokenState: currentTokenState.state
      };
    }

    // Re-scan at click time so dynamically added multi-step markup fails closed.
    captureInitialPageStepPublicIds();
    const currentParts = getUrlParts(window.location.href);
    const ageMs = Date.now() - initialPageSessionContext.capturedAt;
    const canUseInitialToken =
      Boolean(initialPageSessionContext.token) &&
      Boolean(stepPublicId) &&
      ageMs >= 0 &&
      ageMs <= INITIAL_SESSION_TOKEN_FALLBACK_MAX_AGE_MS &&
      currentParts.origin === initialPageSessionContext.origin &&
      currentParts.path === initialPageSessionContext.path &&
      initialPageStepPublicIds.size === 1 &&
      initialPageStepPublicIds.has(stepPublicId);

    if (canUseInitialToken) {
      return {
        token: initialPageSessionContext.token,
        source: 'initial_page_same_step',
        ageMs,
        currentTokenState: currentTokenState.state
      };
    }

    return {
      token: null,
      source: 'missing',
      ageMs,
      currentTokenState: currentTokenState.state
    };
  }

  function postUpsellEvent(supabaseUrl, eventName, details) {
    try {
      const pageParts = getUrlParts(window.location.href);
      const destinationParts = details && details.destination_url ? getUrlParts(details.destination_url) : {};
      const payload = Object.assign({}, details && details.payload ? details.payload : {}, {
        page_url_length: window.location.href.length,
        has_ks: new URLSearchParams(window.location.search).has('ks'),
        frame_context: getFrameContext(),
        accept_step_public_ids: collectStepPublicIdsFromPage()
      });

      const body = {
        trace_id: (details && details.trace_id) || getFlowTraceId(),
        event_name: eventName,
        phase: (details && details.phase) || 'browser',
        source: 'upsell_processor_script',
        severity: (details && details.severity) || 'info',
        provider: details && details.provider,
        original_provider: details && details.original_provider,
        action: details && details.action,
        step_public_id: details && details.step_public_id,
        session_token: details && details.session_token,
        transaction_id: details && details.transaction_id,
        http_status: details && details.http_status,
        duration_ms: details && details.duration_ms,
        status: details && details.status,
        error_message: details && details.error_message,
        page_origin: pageParts.origin,
        page_path: pageParts.path,
        page_query_keys: pageParts.queryKeys,
        referrer_origin: getReferrerOrigin(),
        destination_origin: destinationParts.origin || null,
        destination_path: destinationParts.path || null,
        destination_query_keys: destinationParts.queryKeys || null,
        has_funnel_token: pageParts.hasKs,
        payload: payload
      };

      const endpoint = `${supabaseUrl}/functions/v1/track-checkout-flow-event`;
      const serialized = JSON.stringify(body);
      let isSameOriginEndpoint = false;

      try {
        isSameOriginEndpoint = new URL(endpoint, window.location.href).origin === window.location.origin;
      } catch (_) {}

      // Cross-origin Beacon requests always include credentials. The telemetry
      // endpoint intentionally uses wildcard CORS and does not need cookies, so
      // reserve Beacon for same-origin calls and use an explicit credentialless
      // fetch for Supabase.
      if (navigator.sendBeacon && isSameOriginEndpoint) {
        const blob = new Blob([serialized], { type: 'application/json' });
        if (navigator.sendBeacon(endpoint, blob)) return;
      }

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serialized,
        credentials: 'omit',
        keepalive: true
      }).catch(function() {});
    } catch (_) {}
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getDeclineMessage(lang, code) {
    if (code === 'insufficient_funds') return lang.insufficientFunds;
    if (code === 'do_not_honor' || code === 'do_not_try_again' || code === 'call_issuer') return lang.doNotHonor;
    if (code === 'generic_decline' || code === 'card_declined') return lang.genericDecline;
    if (code === 'authentication_required') return lang.authenticationRequired;
    return lang.declinedMessage;
  }

  function isAlreadyProcessedError(message) {
    const normalized = String(message || '').toLowerCase();
    return normalized.includes('processado anteriormente') || normalized.includes('already processed');
  }

  function showDeclined(content, lang, onRetry, onSkip, options) {
    const modal = content.parentElement;
    if (modal) {
      applyDialogLayout(modal, content);
    }

    const canRetry = options && options.canRetry === true;
    const isPending = options && options.pending === true;
    const title = escapeHtml((options && options.title) || (isPending ? lang.pending : lang.declined));
    const message = escapeHtml((options && options.message) || lang.declinedMessage);
    const iconBackground = isPending ? '#f59e0b' : '#ef4444';
    const iconMarkup = isPending
      ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>'
      : '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    content.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 24px;">
        <div style="
          width: 64px;
          height: 64px;
          background: ${iconBackground};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          ${iconMarkup}
        </div>
        <div>
          <p style="
            margin: 0 0 8px 0;
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
          ">${title}</p>
          <p style="
            margin: 0;
            font-size: 14px;
            color: #6b7280;
            line-height: 1.5;
          ">${message}</p>
        </div>
        <div style="display: flex; gap: 12px; width: 100%;">
          <button id="kashpay-skip-btn" style="
            flex: 1;
            padding: 12px 24px;
            border: 2px solid #d1d5db;
            background: white;
            color: #6b7280;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
          ">${lang.skip}</button>
          ${canRetry ? `<button id="kashpay-retry-btn" style="
            flex: 1;
            padding: 12px 24px;
            border: none;
            background: #01b44a;
            color: white;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
          ">${lang.tryAgain}</button>` : ''}
        </div>
      </div>
    `;

    const retryBtn = document.getElementById('kashpay-retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', onRetry);
    document.getElementById('kashpay-skip-btn').addEventListener('click', onSkip);

    if (retryBtn) {
      retryBtn.addEventListener('mouseenter', function() {
        this.style.background = '#019a3e';
      });
      retryBtn.addEventListener('mouseleave', function() {
        this.style.background = '#01b44a';
      });
    }

    document.getElementById('kashpay-skip-btn').addEventListener('mouseenter', function() {
      this.style.background = '#f3f4f6';
    });
    document.getElementById('kashpay-skip-btn').addEventListener('mouseleave', function() {
      this.style.background = 'white';
    });
  }

  function getSupabaseUrl() {
    const script = document.currentScript || document.querySelector('script[data-kashpay-supabase-url]');
    const configuredUrl =
      (script && script.dataset && script.dataset.kashpaySupabaseUrl) ||
      window.KASHPAY_SUPABASE_URL ||
      'https://jzrwfrdwgjuarybyegao.supabase.co';

    return String(configuredUrl).replace(/\/+$/, '');
  }

  function buildProcessUrl(supabaseUrl, functionName, stepPublicId, ks, action) {
    const processUrl = new URL(`${supabaseUrl}/functions/v1/${functionName}/${encodeURIComponent(stepPublicId || '')}`);
    processUrl.searchParams.set('ks', ks);
    processUrl.searchParams.set('action', action);
    return processUrl.toString();
  }

  async function callUpsellEndpoint(supabaseUrl, functionName, stepPublicId, ks, action, traceId, options) {
    const requestOptions = options || {};
    const processUrl = buildProcessUrl(supabaseUrl, functionName, stepPublicId, ks, action);
    const requestUrl = new URL(processUrl);
    requestUrl.searchParams.set('trace_id', traceId);
    const startedAt = Date.now();
    const requestMethod = requestOptions.method || (
      functionName === 'create-whop-upsell-charge' ? 'POST' : 'GET'
    );
    const requestHeaders = {
      'Accept': 'application/json',
      ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {})
    };

    postUpsellEvent(supabaseUrl, 'upsell_browser_request_start', {
      trace_id: traceId,
      provider: functionName === 'create-whop-upsell-charge' ? 'whop' : 'stripe',
      action,
      step_public_id: stepPublicId,
      session_token: ks,
      destination_url: requestUrl.toString(),
      payload: {
        function_name: functionName
      }
    });

    const response = await fetch(requestUrl.toString(), {
      method: requestMethod,
      headers: requestHeaders,
      ...(requestOptions.body ? { body: JSON.stringify(requestOptions.body) } : {})
    });
    let data = {};
    let parseError = null;
    try {
      data = await response.json();
    } catch (error) {
      parseError = error && error.message ? error.message : String(error);
    }

    postUpsellEvent(supabaseUrl, 'upsell_browser_response_received', {
      trace_id: traceId,
      provider: data.provider || (functionName === 'create-whop-upsell-charge' ? 'whop' : 'stripe'),
      action,
      step_public_id: stepPublicId,
      session_token: ks,
      http_status: response.status,
      duration_ms: Date.now() - startedAt,
      error_message: parseError || data.error || null,
      payload: {
        function_name: functionName,
        response_ok: response.ok,
        response_provider: data.provider || null,
        has_redirect_url: Boolean(data.redirectUrl),
        has_skip_url: Boolean(data.skipUrl),
        checkout_redirect: Boolean(data.checkout_redirect),
        pending: Boolean(data.pending),
        requires_action: Boolean(data.requiresAction),
        has_client_secret: Boolean(data.clientSecret),
        has_publishable_key: Boolean(data.publishableKey),
        already_processed: Boolean(data.alreadyProcessed),
        failure_code: data.failureCode || data.declineCode || null,
        whop_status: data.whop_status || null,
        parse_error: parseError
      }
    });

    return { response, data };
  }

  let stripeJsPromise = null;

  function loadStripeJs() {
    if (typeof window.Stripe === 'function') return Promise.resolve(window.Stripe);
    if (stripeJsPromise) return stripeJsPromise;

    stripeJsPromise = new Promise(function(resolve, reject) {
      const scriptUrl = 'https://js.stripe.com/v3/';
      let script = null;
      try {
        script = document.querySelector('script[src="' + scriptUrl + '"]');
      } catch (_) {}

      function resolveLoadedStripe() {
        if (typeof window.Stripe === 'function') {
          resolve(window.Stripe);
          return;
        }
        reject(new Error('Stripe.js nÃ£o foi carregado'));
      }

      if (script) {
        script.onload = resolveLoadedStripe;
        script.onerror = function() { reject(new Error('Stripe.js nÃ£o pÃ´de ser carregado')); };
        return;
      }

      try {
        script = document.createElement('script');
        script.src = scriptUrl;
        script.async = true;
        script.onload = resolveLoadedStripe;
        script.onerror = function() { reject(new Error('Stripe.js nÃ£o pÃ´de ser carregado')); };
        const parent = document.head || document.body || document.documentElement;
        if (!parent || typeof parent.appendChild !== 'function') {
          reject(new Error('NÃ£o foi possÃ­vel inserir Stripe.js'));
          return;
        }
        parent.appendChild(script);
      } catch (_) {
        reject(new Error('NÃ£o foi possÃ­vel inserir Stripe.js'));
      }
    });

    return stripeJsPromise;
  }

  function callStripeUpsellConfirmationEndpoint(supabaseUrl, stepPublicId, ks, traceId, paymentIntentId) {
    return callUpsellEndpoint(
      supabaseUrl,
      'upsell-process',
      stepPublicId,
      ks,
      'accept',
      traceId,
      {
        method: 'POST',
        body: {
          phase: 'confirm',
          payment_intent_id: paymentIntentId
        }
      }
    );
  }

  function waitForStripeUpsellRetry(delayMs) {
    return new Promise(function(resolve) {
      window.setTimeout(resolve, delayMs);
    });
  }

  function waitForWhopPendingRetry(delayMs) {
    return new Promise(function(resolve) {
      window.setTimeout(resolve, delayMs);
    });
  }

  async function resolveStripeUpsellPaymentAction(
    initialResult,
    supabaseUrl,
    stepPublicId,
    ks,
    traceId,
    url,
    action,
    modal,
    content,
    lang
  ) {
    let result = initialResult;
    const maxPolls = 12;

    for (let attempt = 0; attempt <= maxPolls; attempt += 1) {
      if (
        result.data &&
        result.data.pending &&
        result.data.error === 'stripe_payment_action_unavailable'
      ) {
        showDeclined(
          content,
          lang,
          function() {
            modal.remove();
            processUpsellAction(url, action);
          },
          function() {
            if (result.data.skipUrl) window.location.href = result.data.skipUrl;
            else modal.remove();
          },
          { canRetry: true, pending: true, message: lang.pendingMessage }
        );
        return null;
      }

      if (result.response.ok && result.data && result.data.requiresAction) {
        if (
          result.data.provider !== 'stripe' ||
          !result.data.clientSecret ||
          !result.data.publishableKey ||
          !result.data.paymentIntentId
        ) {
          throw new Error('A autenticaÃ§Ã£o do pagamento nÃ£o estÃ¡ disponÃ­vel');
        }

        postUpsellEvent(supabaseUrl, 'upsell_browser_payment_action_started', {
          trace_id: traceId,
          provider: 'stripe',
          action,
          step_public_id: stepPublicId,
          session_token: ks,
          payload: {
            attempt,
            has_client_secret: true,
            has_publishable_key: true,
            payment_intent_id: result.data.paymentIntentId
          }
        });

        let confirmationFailure = null;
        const paymentIntentId = result.data.paymentIntentId;

        try {
          const Stripe = await loadStripeJs();
          const stripe = Stripe(result.data.publishableKey);
          const confirmation = await stripe.confirmCardPayment(result.data.clientSecret);
          if (confirmation && confirmation.error) {
            confirmationFailure = confirmation.error;
            postUpsellEvent(supabaseUrl, 'upsell_browser_payment_action_failed', {
              trace_id: traceId,
              provider: 'stripe',
              action,
              step_public_id: stepPublicId,
              session_token: ks,
              error_message: confirmation.error.message || 'Stripe authentication failed',
              payload: {
                attempt,
                payment_intent_id: result.data.paymentIntentId,
                failure_code: confirmation.error.code || null
              }
            });
          } else {
            postUpsellEvent(supabaseUrl, 'upsell_browser_payment_action_succeeded', {
              trace_id: traceId,
              provider: 'stripe',
              action,
              step_public_id: stepPublicId,
              session_token: ks,
              payload: {
                attempt,
                payment_intent_id: paymentIntentId,
                payment_intent_status: confirmation && confirmation.paymentIntent
                  ? confirmation.paymentIntent.status
                  : null
              }
            });
          }
        } catch (error) {
          confirmationFailure = error || new Error('Stripe authentication failed');
          postUpsellEvent(supabaseUrl, 'upsell_browser_payment_action_failed', {
            trace_id: traceId,
            provider: 'stripe',
            action,
            step_public_id: stepPublicId,
            session_token: ks,
            error_message: error && error.message ? error.message : 'Stripe authentication failed',
            payload: {
              attempt,
              payment_intent_id: result.data.paymentIntentId
            }
          });
        }

        result = await callStripeUpsellConfirmationEndpoint(
          supabaseUrl,
          stepPublicId,
          ks,
          traceId,
          paymentIntentId
        );

        if (confirmationFailure) {
          if (
            !result.data ||
            (!result.data.pending && !result.data.requiresAction)
          ) return result;

          showDeclined(
            content,
            lang,
            function() {
              modal.remove();
              processUpsellAction(url, action);
            },
            function() {
              if (result.data.skipUrl) window.location.href = result.data.skipUrl;
              else modal.remove();
            },
            {
              canRetry: true,
              pending: true,
              message: getDeclineMessage(lang, 'authentication_required')
            }
          );
          return null;
        }
        continue;
      }

      if (result.response.ok && result.data && result.data.pending) {
        if (attempt >= maxPolls) {
          postUpsellEvent(supabaseUrl, 'upsell_browser_payment_pending_timeout', {
            trace_id: traceId,
            provider: 'stripe',
            action,
            step_public_id: stepPublicId,
            session_token: ks,
            payload: {
              attempts: attempt,
              payment_intent_id: result.data.paymentIntentId
            }
          });
          showDeclined(
            content,
            lang,
            function() {
              modal.remove();
              processUpsellAction(url, action);
            },
            function() {
              if (result.data.skipUrl) window.location.href = result.data.skipUrl;
              else modal.remove();
            },
            { canRetry: true, pending: true, message: lang.pendingMessage }
          );
          return null;
        }
        await waitForStripeUpsellRetry(1000);
        result = await callStripeUpsellConfirmationEndpoint(
          supabaseUrl,
          stepPublicId,
          ks,
          traceId,
          result.data.paymentIntentId
        );
        continue;
      }

      return result;
    }

    return result;
  }

  async function resolveWhopPendingPayment(
    initialResult,
    supabaseUrl,
    stepPublicId,
    ks,
    traceId,
    action,
    modal,
    content,
    lang
  ) {
    let result = initialResult;
    const maxPolls = 6;
    const boundTransactionId = result.data && result.data.transaction_id;

    postUpsellEvent(supabaseUrl, 'upsell_browser_whop_pending_reconciliation_started', {
      trace_id: traceId,
      provider: 'whop',
      action,
      step_public_id: stepPublicId,
      session_token: ks,
      http_status: result.response.status,
      transaction_id: result.data && result.data.transaction_id || null,
      payload: {
        max_polls: maxPolls,
        has_whop_payment_id: Boolean(result.data && result.data.whop_payment_id)
      }
    });

    if (!boundTransactionId) {
      showDeclined(
        content,
        lang,
        function() {},
        function() {
          if (result.data && result.data.skipUrl) window.location.href = result.data.skipUrl;
          else modal.remove();
        },
        { canRetry: false, pending: true, message: lang.whopPendingMessage }
      );
      return null;
    }

    for (let attempt = 0; attempt <= maxPolls; attempt += 1) {
      if (
        !result.response.ok ||
        !result.data ||
        result.data.provider !== 'whop' ||
        !result.data.pending
      ) {
        return result;
      }

      if (attempt >= maxPolls) {
        postUpsellEvent(supabaseUrl, 'upsell_browser_whop_pending_timeout', {
          trace_id: traceId,
          provider: 'whop',
          action,
          step_public_id: stepPublicId,
          session_token: ks,
          http_status: result.response.status,
          transaction_id: result.data.transaction_id || null,
          severity: 'warning',
          status: 'pending',
          payload: {
            attempts: attempt,
            has_whop_payment_id: Boolean(result.data.whop_payment_id),
            no_new_charge: true
          }
        });
        showDeclined(
          content,
          lang,
          function() {},
          function() {
            if (result.data.skipUrl) window.location.href = result.data.skipUrl;
            else modal.remove();
          },
          {
            canRetry: false,
            pending: true,
            message: lang.whopPendingMessage
          }
        );
        return null;
      }

      await waitForWhopPendingRetry(1000);
      // Reuse the exact bound transaction in the read-only redirect phase.
      // The server may reconcile an existing pending payment, but it can never
      // claim a failed row or issue a new provider POST from this poll.
      result = await callUpsellEndpoint(
        supabaseUrl,
        'create-whop-upsell-charge',
        stepPublicId,
        ks,
        action,
        traceId,
        {
          method: 'POST',
          body: {
            phase: 'resolve_redirect',
            transaction_id: boundTransactionId
          }
        }
      );
    }

    return result;
  }

  async function callProviderAwareUpsellEndpoint(supabaseUrl, stepPublicId, ks, action, traceId) {
    const whopResult = await callUpsellEndpoint(
      supabaseUrl,
      'create-whop-upsell-charge',
      stepPublicId,
      ks,
      action,
      traceId
    );

    if (
      whopResult.response.status === 409 &&
      whopResult.data &&
      whopResult.data.provider === 'stripe'
    ) {
      postUpsellEvent(supabaseUrl, 'upsell_browser_provider_fallback_to_stripe', {
        trace_id: traceId,
        provider: 'stripe',
        original_provider: 'whop',
        action,
        step_public_id: stepPublicId,
        session_token: ks,
        http_status: whopResult.response.status,
        error_message: whopResult.data.error || null
      });
      return callUpsellEndpoint(supabaseUrl, 'upsell-process', stepPublicId, ks, action, traceId);
    }

    return whopResult;
  }

  async function processUpsellAction(url, action) {
    const lang = getLanguage();
    const supabaseUrl = getSupabaseUrl();
    const traceId = getFlowTraceId();
    let stepPublicId = null;

    try {
      const urlObj = new URL(url);
      stepPublicId = urlObj.pathname.split('/').pop();
    } catch (_) {}

    const sessionTokenResolution = resolveSessionTokenForAction(stepPublicId);
    const ks = sessionTokenResolution.token;

    if (!ks) {
      console.error('[KashPay] Token ks não encontrado na URL');
      postUpsellEvent(supabaseUrl, 'upsell_browser_missing_session_token', {
        trace_id: traceId,
        action,
        step_public_id: stepPublicId,
        severity: 'error',
        error_message: 'Token ks not found in URL',
        payload: {
          clicked_url_origin: getUrlParts(url).origin,
          clicked_url_path: getUrlParts(url).path,
          clicked_url_query_keys: getUrlParts(url).queryKeys,
          clicked_url_has_ks: getUrlParts(url).hasKs,
          current_url_ks_state: sessionTokenResolution.currentTokenState,
          token_resolution_source: sessionTokenResolution.source
        }
      });
      return;
    }

    if (
      sessionTokenResolution.source === 'initial_page_same_step' &&
      !recoveredTokenTelemetryStepIds.has(stepPublicId)
    ) {
      recoveredTokenTelemetryStepIds.add(stepPublicId);
      postUpsellEvent(supabaseUrl, 'upsell_browser_session_token_recovered_from_initial_url', {
        trace_id: traceId,
        action,
        step_public_id: stepPublicId,
        payload: {
          token_source: sessionTokenResolution.source,
          current_url_has_ks: false,
          fallback_age_ms: sessionTokenResolution.ageMs
        }
      });
    }

    postUpsellEvent(supabaseUrl, 'upsell_browser_action_start', {
      trace_id: traceId,
      action,
      step_public_id: stepPublicId,
      session_token: ks,
      payload: { clicked_url_origin: getUrlParts(url).origin, clicked_url_path: getUrlParts(url).path }
    });

    const { modal, content } = createModal();
    showSpinner(content, lang);

    postUpsellEvent(supabaseUrl, 'upsell_browser_processing_modal_shown', {
      trace_id: traceId,
      action,
      step_public_id: stepPublicId,
      session_token: ks
    });

    // Extrair public_id da URL (formato: https://qualquer-dominio.com/u/PUBLIC_ID)
    try {
      let providerResult = await callProviderAwareUpsellEndpoint(
        supabaseUrl,
        stepPublicId,
        ks,
        action,
        traceId
      );

      if (
        providerResult.data &&
        providerResult.data.provider === 'whop' &&
        providerResult.data.pending
      ) {
        providerResult = await resolveWhopPendingPayment(
          providerResult,
          supabaseUrl,
          stepPublicId,
          ks,
          traceId,
          action,
          modal,
          content,
          lang
        );
        if (!providerResult) return;
      }

      if (
        providerResult.data &&
        providerResult.data.provider === 'stripe' &&
        (providerResult.data.requiresAction || providerResult.data.pending)
      ) {
        providerResult = await resolveStripeUpsellPaymentAction(
          providerResult,
          supabaseUrl,
          stepPublicId,
          ks,
          traceId,
          url,
          action,
          modal,
          content,
          lang
        );
        if (!providerResult) return;
      }

      const { response, data } = providerResult;

      if (!response.ok) {
        if (data.skipUrl && isAlreadyProcessedError(data.error)) {
          postUpsellEvent(supabaseUrl, 'upsell_browser_already_processed_redirect', {
            trace_id: traceId,
            provider: data.provider || null,
            action,
            step_public_id: stepPublicId,
            session_token: ks,
            http_status: response.status,
            destination_url: data.skipUrl,
            error_message: data.error || null
          });
          showSuccess(content, lang, data.skipUrl);
          return;
        }

        if (data.error && (data.error.includes('declined') || data.error.includes('recusad'))) {
          const failureCode = data.declineCode || data.failureCode;
          if (
            data.error === 'payment_declined' &&
            data.canRetry !== true &&
            data.skipUrl
          ) {
            postUpsellEvent(supabaseUrl, 'upsell_browser_terminal_decline_auto_redirect', {
              trace_id: traceId,
              provider: data.provider || null,
              action,
              step_public_id: stepPublicId,
              session_token: ks,
              http_status: response.status,
              destination_url: data.skipUrl,
              payload: {
                failure_code: failureCode || null,
                skip_all_upsells: Boolean(data.skipAllUpsells),
                can_retry: false
              }
            });
            window.location.href = data.skipUrl;
            return;
          }

          postUpsellEvent(supabaseUrl, 'upsell_browser_declined_modal_shown', {
            trace_id: traceId,
            provider: data.provider || null,
            action,
            step_public_id: stepPublicId,
            session_token: ks,
            http_status: response.status,
            error_message: data.error || null,
            payload: {
              failure_code: failureCode || null,
              has_skip_url: Boolean(data.skipUrl),
              skip_all_upsells: Boolean(data.skipAllUpsells),
              can_retry: data.canRetry === true
            }
          });
          showDeclined(
            content,
            lang,
            () => {
              postUpsellEvent(supabaseUrl, 'upsell_browser_retry_clicked_after_decline', {
                trace_id: traceId,
                provider: data.provider || null,
                action,
                step_public_id: stepPublicId,
                session_token: ks,
                http_status: response.status
              });
              modal.remove();
              processUpsellAction(url, action);
            },
            () => {
              postUpsellEvent(supabaseUrl, 'upsell_browser_skip_clicked_after_decline', {
                trace_id: traceId,
                provider: data.provider || null,
                action,
                step_public_id: stepPublicId,
                session_token: ks,
                http_status: response.status,
                destination_url: data.skipUrl || null
              });
              if (data.skipUrl) {
                window.location.href = data.skipUrl;
              } else {
                modal.remove();
              }
            },
            {
              canRetry: data.canRetry === true,
              message: getDeclineMessage(lang, failureCode),
            }
          );
          return;
        }

        throw new Error(data.error || 'Erro ao processar pagamento');
      }

      if (data.redirectUrl) {
        const frameContext = getFrameContext();
        postUpsellEvent(supabaseUrl, 'upsell_browser_redirect_attempt', {
          trace_id: traceId,
          provider: data.provider || null,
          action,
          step_public_id: stepPublicId,
          session_token: ks,
          transaction_id: data.transaction_id || null,
          http_status: response.status,
          destination_url: data.redirectUrl,
          payload: {
            redirect_has_ks: getUrlParts(data.redirectUrl).hasKs,
            pending: Boolean(data.pending),
            checkout_redirect: Boolean(data.checkout_redirect),
            is_in_iframe: frameContext.isInIframe,
            window_top_accessible: frameContext.topAccessible,
            window_top_same: frameContext.topSameAsSelf,
            redirect_strategy: frameContext.isInIframe ? 'top_location_with_self_fallback' : 'self_location'
          }
        });
        setTimeout(function() {
          const currentParts = getUrlParts(window.location.href);
          postUpsellEvent(supabaseUrl, 'upsell_browser_redirect_still_on_page_after_1500ms', {
            trace_id: traceId,
            provider: data.provider || null,
            action,
            step_public_id: stepPublicId,
            session_token: ks,
            transaction_id: data.transaction_id || null,
            http_status: response.status,
            destination_url: data.redirectUrl,
            severity: 'warning',
            payload: {
              current_origin: currentParts.origin,
              current_path: currentParts.path,
              current_query_keys: currentParts.queryKeys,
              current_has_ks: currentParts.hasKs,
              expected_origin: getUrlParts(data.redirectUrl).origin,
              expected_path: getUrlParts(data.redirectUrl).path,
              frame_context: getFrameContext()
            }
          });
        }, 1500);
        showSuccess(content, lang, data.redirectUrl);
      } else {
        throw new Error('URL de redirecionamento não encontrada');
      }
    } catch (err) {
      console.error('[KashPay] Erro:', err);
      postUpsellEvent(supabaseUrl, 'upsell_browser_request_exception', {
        trace_id: traceId,
        action,
        step_public_id: stepPublicId,
        session_token: ks,
        severity: 'error',
        error_message: err && err.message ? err.message : String(err)
      });
      showDeclined(
        content,
        lang,
        () => {
          postUpsellEvent(supabaseUrl, 'upsell_browser_retry_clicked_after_exception', {
            trace_id: traceId,
            action,
            step_public_id: stepPublicId,
            session_token: ks
          });
          modal.remove();
          processUpsellAction(url, action);
        },
        () => {
          postUpsellEvent(supabaseUrl, 'upsell_browser_skip_clicked_after_exception', {
            trace_id: traceId,
            action,
            step_public_id: stepPublicId,
            session_token: ks
          });
          modal.remove();
        },
        { canRetry: false }
      );
    }
  }

  window.acceptUpsell = async function(url) {
    processUpsellAction(url, 'accept');
  };

  window.declineUpsell = async function(url) {
    processUpsellAction(url, 'decline');
  };

  // Os handlers legados sao publicados antes do recurso opcional de delay.
  initializeUpsellDelaySupport();

  function initUpsellPageInstrumentation() {
    const supabaseUrl = getSupabaseUrl();
    const traceId = getFlowTraceId();
    captureInitialPageStepPublicIds();
    const base = {
      trace_id: traceId,
      session_token: initialPageSessionContext.token,
      payload: {
        document_ready_state: document.readyState,
        user_agent_language: navigator.language || null
      }
    };

    postUpsellEvent(supabaseUrl, 'upsell_browser_script_ready', base);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        captureInitialPageStepPublicIds();
        postUpsellEvent(supabaseUrl, 'upsell_browser_dom_ready', base);
      });
    } else {
      captureInitialPageStepPublicIds();
      postUpsellEvent(supabaseUrl, 'upsell_browser_dom_ready', base);
    }

    window.addEventListener('load', function() {
      captureInitialPageStepPublicIds();
      postUpsellEvent(supabaseUrl, 'upsell_browser_window_loaded', base);
    });

    window.addEventListener('beforeunload', function() {
      postUpsellEvent(supabaseUrl, 'upsell_browser_before_unload', base);
    });
  }

  initUpsellPageInstrumentation();
})();
