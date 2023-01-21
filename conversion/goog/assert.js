
/**
 * Base class for custom error objects.
 * @param {*=} msg The message associated with the error.
 * @param {{
 *    message: (?|undefined),
 *    name: (?|undefined),
 *    lineNumber: (?|undefined),
 *    fileName: (?|undefined),
 *    stack: (?|undefined),
 *    cause: (?|undefined),
 * }=} cause The original error object to chain with.
 * @constructor
 * @extends {Error}
 */
export class DebugError extends Error {
	name = 'CustomError';

	/**
	 * Whether to report this error to the server. Setting this to false will
	 * cause the error reporter to not report the error back to the server,
	 * which can be useful if the client knows that the error has already been
	 * logged on the server.
	 * @type {boolean}
	 */
	reportErrorToServer = true;

	constructor(msg = undefined, cause = undefined) {
		// Attempt to ensure there is a stack trace.
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, DebugError);
		} else {
			const stack = new Error().stack;
			if (stack) {
				/** @override @type {string} */
				this.stack = stack;
			}
		}

		if (msg) {
			/** @override @type {string} */
			this.message = String(msg);
		}

		if (cause !== undefined) {
			/** @type {?} */
			this.cause = cause;
		}
	}
}


/**
 * Error object for failed assertions.
 * @param {string} messagePattern The pattern that was used to form message.
 * @param {!Array<*>} messageArgs The items to substitute into the pattern.
 * @constructor
 * @extends {DebugError}
 * @final
 */
export class AssertionError extends DebugError {
	name = 'AssertionError';

	/**
	 * The message pattern used to format the error message. Error handlers can
	 * use this to uniquely identify the assertion.
	 * @type {string}
	 */
	messagePattern;

	constructor(messagePattern, messageArgs) {
		super(this, subs(messagePattern, messageArgs));

		this.messagePattern = messagePattern;
	}
}


/**
 * The default error handler.
 * @param {!AssertionError} e The exception to be handled.
 * @return {void}
 */
const DEFAULT_ERROR_HANDLER = function (e) {
	throw e;
};


/**
 * The handler responsible for throwing or logging assertion errors.
 * @type {function(!AssertionError)}
 */
let errorHandler_ = DEFAULT_ERROR_HANDLER;


/**
 * Throws an exception with the given message and "Assertion failed" prefixed
 * onto it.
 * @param {string} defaultMessage The message to use if givenMessage is empty.
 * @param {?Array<*>} defaultArgs The substitution arguments for defaultMessage.
 * @param {string|undefined} givenMessage Message supplied by the caller.
 * @param {!Array<*>} givenArgs The substitution arguments for givenMessage.
 * @throws {AssertionError} When the value is not a number.
 */
function doAssertFailure(defaultMessage, defaultArgs, givenMessage, givenArgs) {
	let message = 'Assertion failed';
	let args;
	if (givenMessage) {
		message += ': ' + givenMessage;
		args = givenArgs;
	} else if (defaultMessage) {
		message += ': ' + defaultMessage;
		args = defaultArgs;
	}
	// The '' + works around an Opera 10 bug in the unit tests. Without it,
	// a stack trace is added to var message above. With this, a stack trace is
	// not added until this line (it causes the extra garbage to be added after
	// the assertion message instead of in the middle of it).
	const e = new AssertionError('' + message, args || []);
	errorHandler_(e);
}


/**
 * Checks if the condition evaluates to true if ENABLE_ASSERTS is
 * true.
 * @template T
 * @param {T} condition The condition to check.
 * @param {string=} opt_message Error message in case of failure.
 * @param {...*} var_args The items to substitute into the failure message.
 * @return {T} The value of the condition.
 * @throws {AssertionError} When the condition evaluates to false.
 * @closurePrimitive {asserts.truthy}
 */
export function assert(condition, opt_message, var_args) {
	if (ENABLE_ASSERTS && !condition) {
		doAssertFailure(
			'', null, opt_message, Array.prototype.slice.call(arguments, 2));
	}
	return condition;
};
