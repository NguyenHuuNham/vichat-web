class PROMOTION_STATUS():
    ACTIVE = 'active'
    DEACTIVE = 'deactive'
    CANCELED = 'canceled'
    LOCKED = 'locked'
    BAN = 'banned'

class COUPON_STATUS():
    ACTIVE = 'active'
    DEACTIVE = 'deactive'
    NOTIFIED = 'notified'
    CANCELED = 'canceled'
    LOCKED = 'locked'
    BAN = 'banned'
    LOG = 'log'
    SCANNING = 'scanning'

class SALESORDER_STATUS():
    COMPLETED = 'completed'
    CONFIRM = 'confirm'
    PENDING = 'pending'
    ORDERING = 'ordering'
    DELIVERY = 'delivery'
    DELAY = 'delay'
    CANCELED = 'canceled'

class PAYMENT_STATUS():
    PAID = 'paid'
    UNPAID = 'unpaid'

class RANK_VERB():
    PLUS = 'plus'
    BONUS = 'bonus'
    MINUS = 'minus'


class RESPONSE_STATUS_CODE():
    OK = 200
    NOT_FOUND = 524
    AUTH_ERROR = 403
    INTERNAL_ERROR = 520


class PAYMENT_METHOD_TYPE():
    CASH = 'CASH'
    CARD = 'CARD'
    ATM = 'CARD'
    VISA = 'CARD'
    MASTER = 'CARD'
    MOMO = 'EWALLET'
    VNPAY = 'EWALLET'
    MOCA = 'EWALLET'
    TRANSFER = 'TRANSFER'
    OTHER = 'OTHER'


STATUS_CODE = {
    "OK": 200,
    "ERROR": 520,
    "NOT_FOUND": 521,
    "AUTH": 523,
    "AUTH_ERROR": 523
}


status = {
    "active": "active",
    "deactive": "deactive",
    "delete": "delete",
    "show": "show",
    "hide": "hide"
}


promotion_status = {
    "active": "active",
    "deactive": "deactive",
    "notified": "notified",
    "used": "used",
    "canceled": "canceled",
    "locked": "locked",
    "log": "log",
    "scanning": "scanning"
}

promotion_combine = {
    "allow_limit": "allow-limit",
    "allow": "allow",
    "not_allow": "not-allow",
    "allow_auto": "allow-auto"
}

order_status = {
    "new": "new",
    "quoted": "quoted",
    "done": "done",
    "canceled": "canceled"
}

send_status = {
    "pending": "pending",
    "sending": "sending",
    "success": "success",
    "responsed": "responsed",
    "error": "error"
}

MSG_CODE = {
    "SUCCESS": "SUCCESS"
}

MSG = {
    "SUCCESS": "Success"
}


ERROR_CODE = {
    "EXCEPTION": "EXCEPTION",
    "SERVER_ERROR": "SERVER_ERROR",
    "AUTH_ERROR": "AUTH_ERROR",
    "TOKEN_ERROR": "NOT_PERMISSION",
    "NOT_FOUND": "NOT_FOUND",
    "EXIST_ERROR": "EXIST_ERROR",
    "NULL_ERROR": "NULL_ERROR",
    "ARGS_ERROR": "ARGS_ERROR",
    "DATA_FORMAT": "DATA_FORMAT",
    "INPUT_DATA_ERROR": "INPUT_DATA_ERROR"
}

ERROR_MSG = {
    "EXCEPTION": "Handle Exception",
    "SERVER_ERROR": "Server error",
    "AUTH_ERROR": "Authentication is failed",
    "TOKEN_ERROR": "Permission denied",
    "EXIST_ERROR": "Record already exists",
    "NOT_FOUND": "Not Found",
    "NULL_ERROR": "Some fields are not allow to be empty",
    "ARGS_ERROR": "Get arguments error",
    "DATA_FORMAT": "Data format is not correct",
    "INPUT_DATA_ERROR": "Input data is not enough to handle the business"
}

NEED_PASS_PROMOTION_CONDITIONS = ["contact_group", "contact_score", "day_of_week"]


CONTACT_INTERACTIVE_LOG = {
    "verb_type": {
        "in": "in",
        "out": "out"
    },
    "channel": {
        "direct": {
            "type": "direct",
            "name": "Direct",
            "verb": {
                "call": "call",
                "sms": "sms",
                "meet": "meet",
                "care":"care"
            }
        },
        "facebook": {
            "type": "facebook",
            "name": "Facebook",
            "verb": {
                "chat": "chat",
                "cmt": "cmt",
                "share": "share"
            }
        },
        "zalo": {
            "type": "zalo",
            "name": "Zalo",
            "verb": {
                "chat": "chat",
                "cmt": "cmt",
                "share": "share"
            }
        },
        "app": {
            "type": "app",
            "name": "App",
            "verb": {
                "chat": "chat",
                "buy": "buy"
            }
        },
        "web": {
            "type": "web",
            "name": 'Web',
            "verb": {

            }
        },
        "pos": {
            "type": "pos",
            "name": 'POS',
            "verb": {
                "buy": "buy",
                "return": "return"
            }
        }
    }
}


INTERACTIVE_LOG_VERB = {
    "SMS": "sms",
    "CALL": "call",
    "CHAT": "chat",
    "MEET": "meet",
    "SHARE": "share",
    "CARE": "care",
    "LIKE": "like",
    "LOVE": "love",
    "BUY": "buy",
    "RETURN_ITEM": "return_item",
    "FEEDBACK": "feed_back",
    "CREATE_ACCOUNT": "create_account",
    "UPDATE_ACCOUNT": "update_account",
    "DELETE_ACCOUNT": "delete_account",
    "LOGIN": "login",
    "LOGOUT": "logout"
}


PAYMENT_METHOD_TYPE = {
    "CASH": "CASH",
    "CARD": "CARD",
    "VISA": "CARD",
    "ATM": "CARD",
    "EWALLET": "EWALLET",
    "MOMO": "EWALLET",
    "VNPAY": "EWALLET",
    "COD": "COD"
}


TOUCHPOINT_TYPE_CONST = {
    'subscribe': 'subscribe',
    'transaction': 'transaction',
    'visit': 'visit'
}

