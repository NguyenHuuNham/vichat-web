import re
import copy
import random
import string
import pytz
import time
import hashlib
from datetime import datetime, date
import dateutil.relativedelta
from dateutil import tz
import phonenumbers
from phonenumbers import carrier
from phonenumbers.phonenumberutil import number_type
from jinja2 import Environment, BaseLoader, Template, StrictUndefined, Undefined
from hashids import Hashids

ENV_TIME_ZONE = 7


def current_timezone():
    return int(time.strftime("%z", time.gmtime())[:3])

# The epoch represents UNIX time 0 (At 00:00:00 of 1 January 1970)
def now_timestamp():
    return round(time.time() * 1000)

def get_datetime_timezone(timestamp, timezone='Asia/Ho_Chi_Minh'):
    return datetime.fromtimestamp(timestamp/1000, tz=pytz.timezone(timezone))

# GET BY TIMEZONE
def get_datetime_now(timezone='Asia/Ho_Chi_Minh'):
    return datetime.now(tz=pytz.timezone(timezone))

def string_to_datetime(datetime_str, input_format="%d/%m/%Y %H:%M"):
    return datetime.strptime(datetime_str, input_format)

def string_to_timestamp(datetime_str, input_format="%d/%m/%Y %H:%M"):
    datetime_obj = datetime.strptime(datetime_str, input_format)
    delta_timezone = ENV_TIME_ZONE - current_timezone()
    timestamp = (datetime_obj.timestamp() * 1000) + (delta_timezone * 86400000)
    return timestamp

# GET BY GMT +7
def get_local_today(timezone=7):
    today = datetime.utcnow() + dateutil.relativedelta.relativedelta(hours=timezone)
    return today

def timestamp_to_string(datetime, out_format="%d/%m/%Y %H:%M"):
    new_time_zone = get_datetime_timezone(datetime)
    try:
        date_time = new_time_zone.strftime(out_format)
    except:
        date_time = new_time_zone.strftime("%d/%m/%Y %H:%M")
    return date_time


def get_year_later(number_of_year):
    udate_now = datetime.utcnow()
    current_year = udate_now.year
    date = udate_now.replace(year=current_year + number_of_year)
    return date


def get_start_time_of_day(timestamp=None, timezone='Asia/Ho_Chi_Minh'):
    if timestamp is None:
        timestamp = now_timestamp()
    date = datetime.fromtimestamp(timestamp/1000, tz=pytz.timezone(timezone))
    start_time_date = date.replace(hour=0, minute=0, second=0)
    return start_time_date

def get_end_time_of_day(timestamp=None, timezone='Asia/Ho_Chi_Minh'):
    if timestamp is None:
        timestamp = now_timestamp()
    date = datetime.fromtimestamp(timestamp/1000, tz=pytz.timezone(timezone))
    end_time_date = date.replace(hour=23, minute=59, second=59, microsecond=999)
    return end_time_date


# change phone format
def convert_phone_number(phone, output_type="0"):
    tmp_phone = str(phone)
    output_type = str(output_type)

    tmp_phone = tmp_phone.replace(" ", "")
    if len(tmp_phone) < 13 and len(tmp_phone) > 9:
        if output_type == "84":
            if tmp_phone.startswith("84") == True:
                pass
            elif tmp_phone.startswith("0") == True:
                tmp_phone = tmp_phone.replace("0", "84", 1)
            elif tmp_phone.startswith("+84") == True:
                tmp_phone = tmp_phone.replace("+84", "84", 1)
            else:
                return None
            return tmp_phone

        elif output_type == "+84":
            if tmp_phone.startswith("+84") == True:
                pass
            elif tmp_phone.startswith("0") == True:
                tmp_phone = tmp_phone.replace("0", "+84", 1)
            elif tmp_phone.startswith("84") == True:
                tmp_phone = tmp_phone.replace("84", "+84", 1)
            else:
                return None
            return tmp_phone
        else:
            if tmp_phone.startswith("0") == True:
                pass
            elif tmp_phone.startswith("84") == True:
                tmp_phone = tmp_phone.replace("84", "0", 1)
            elif tmp_phone.startswith("+84") == True:
                tmp_phone = tmp_phone.replace("+84", "0", 1)
            else:
                return None
            return tmp_phone
    elif len(tmp_phone) == 9:
        tmp_phone = '0' + tmp_phone
        return tmp_phone
    else:
        return None


def convert_datetime_format(input_datetime, outFormat=None):
    try:
        find_input_date = date_detector(input_datetime)

        if find_input_date is not None:
            if outFormat == None:
                outFormat = "%d/%m/%Y %H:%M:%S"

            return find_input_date.__format__(outFormat)

        return None
    except:
        return None


#
# convert UTC to local time
# 2018-08-20T00:00:00
# CAUTION: HASN'T TEST FOR WORK YET
def convert_utc_to_local(input_datetime=None):
    utc = None
    if input_datetime is not None and isinstance(input_datetime, str):
        utc = date_detector(input_datetime)
    elif input_datetime is not None and isinstance(input_datetime, datetime):
        utc = input_datetime
    else:
        utc = datetime.utcnow()

    # Auto-detect zones:
    from_zone = tz.tzutc()
    to_zone = tz.tzlocal()

    # Tell the datetime object that it's in UTC time zone since
    # datetime objects are 'naive' by default
    utc = utc.replace(tzinfo=from_zone)

    # Convert time zone
    central = utc.astimezone(to_zone)

    return central


#
# covered cases: 94, 01, 1994, 2001
# consider cases: 201 (2001)
def year_detector(year_tail):
    today = datetime.now()
    current_year = today.year
    year_range = [17, 18, 19, 20, 21]
    try:
        if year_tail is None or year_tail == "":
            return current_year

        if int(year_tail) > 1000:
            return int(year_tail)

        year_tail = str(year_tail)
        if len(year_tail) == 1:
            year_tail = "0" + year_tail
        elif 99 < int(year_tail) <= 999 or int(year_tail) > 9999:
            return current_year

        year = 0
        for _ in year_range:
            if 0 < (current_year - int(str(_) + year_tail)) < 100:
                year = int(str(_) + year_tail)

        return year
    except:
        return current_year


#
# detect & replace it into "-"
#
def detect_separator(datetime_str):
    try:
        p = re.compile(r"[\\/.,_+=;:'\*%&\s]")

        chars = p.findall(datetime_str)

        for c in chars:
            datetime_str = datetime_str.replace(c, "-")

        return datetime_str
    except:
        return datetime_str


#
#
#
def date_detector(inputdate):
    try:
        if inputdate is None or inputdate == "":
            return None

        if isinstance(inputdate, datetime):
            inputdate = inputdate.__format__("%Y-%m-%d %H:%M:%S")
        else:
            if str(inputdate).find("T") >= 0:
                inputdate = str(inputdate).replace("T", " ")
            else:
                inputdate = str(inputdate)

        date_str = ""
        time_str = ""

        if (inputdate.strip()).find(" ", 7) >= 0:
            date_str = inputdate[:inputdate.index(" ")]
            time_str = inputdate[inputdate.index(" ") + 1:]
        else:
            date_str = inputdate
            time_str = "00:00:00"

        # 00:59:59.999
        if time_str.find(".") >= 0 and time_str.index(".") > 2:
            time_str = time_str[:time_str.index(".")]
        # 00.59.59.999
        elif time_str.find(".") >= 0 and time_str.find(".", 8) >= 0:
            time_str = time_str[:time_str.index(".", 8)]

        out_date = None

        date_str = detect_separator(date_str)
        if date_str.find("-") >= 0:
            #
            #             y = date_str[(date_str.rfind("-") + 1):]
            #             try:
            #                 if 0 < int(y) < 100:
            #                     y = year_detector(y)
            #                     date_str = date_str[:(date_str.rfind("-")+1)] + str(y)
            #             except:
            #                 pass

            datetime_str = date_str + " " + time_str

            try:
                out_date = datetime.strptime(datetime_str, "%Y-%m-%d %H:%M:%S")
            except:
                try:
                    out_date = datetime.strptime(
                        datetime_str, "%d-%m-%Y %H:%M:%S")
                except:
                    try:
                        out_date = datetime.strptime(
                            datetime_str, "%Y-%d-%m %H:%M:%S")
                    except:
                        try:
                            out_date = datetime.strptime(
                                datetime_str, "%m-%d-%Y %H:%M:%S")
                        except:
                            # y = date_str[(date_str.rfind("-") + 1):]
                            # try:
                            #     if 0 < int(y) < 100:
                            #         y = year_detector(y)
                            #         date_str = date_str[:(date_str.rfind("-")+1)] + str(y)
                            # except:
                            #     pass
                            out_date = None

        # 01012018, 112018, 1212018, 1102018
        else:
            date_str = date_str.strip()
            y = 0
            m = 0
            d = 0

            if len(date_str) == len("01012018"):
                d = date_str[:2]
                m = date_str[2:][:2]
                y = date_str[4:]
            # 5122018, 2512018
            elif len(date_str) == len("01012018") - 1:
                d = None
                m = None
                y = None
                if int(date_str[1:][:2]) > 12:
                    d = date_str[:2]
                    m = date_str[2:][:1]
                    y = date_str[3:]

                elif int(date_str[1:][:2]) <= 12 and int(date_str[:2]) > 31:
                    d = date_str[:1]
                    m = date_str[1:][:2]
                    y = date_str[3:]

                else:
                    try:
                        d = date_str[:2]
                        m = date_str[2:][:1]
                        y = date_str[3:]
                        test = datetime(int(y), int(m), int(d))
                    except:
                        try:
                            d = date_str[:1]
                            m = date_str[1:][:2]
                            y = date_str[3:]
                            test = datetime(int(y), int(m), int(d))
                        except:
                            pass

            # 112018, 251295
            elif len(date_str) == len("01012018") - 2:
                # 311299
                if int(date_str[-4:]) <= 1299:
                    y = str(year_detector(date_str[-2:]))
                    m = date_str[2:][:2]
                    d = date_str[:2]

                else:
                    d = date_str[:1]
                    m = date_str[1:][:1]
                    y = str(year_detector(date_str[2:]))

            elif len(date_str) == len("01012018") - 3:
                # 25795
                y = str(year_detector(date_str[-2:]))
                if int(date_str[1:][:2]) > 12:
                    m = date_str[2:][:1]
                    d = date_str[:2]
                else:
                    m = date_str[1:][:2]
                    d = date_str[:1]

            else:
                # 2501 -> 25-01-2018
                if int(date_str[2:][:2]) <= 12:
                    d = date_str[:2]
                    m = date_str[2:][:2]
                    y = str(year_detector(None))
                else:
                    # 1594 -> 01-05-1994
                    d = date_str[:1]
                    m = date_str[1:][:1]
                    y = str(year_detector(date_str[-2:]))

            if y == 0 or m == 0 or d == 0:
                return None

            datetime_str = str(y) + "-" + str(m) + "-" + str(d) + " " + time_str

            out_date = datetime.strptime(datetime_str, "%Y-%m-%d %H:%M:%S")

        return out_date
    except:
        return None


# INTERNATIONAL PHONE DETECTOR
# VALUE INPUT MUST START WITH (+) LIKE +84...
def phone_detector(input_value):
    try:
        if carrier._is_mobile(number_type(phonenumbers.parse(input_value))) == True:
            return input_value
        else:
            return None
    except:
        return None


def validate_phone(phone):
    real_phone = convert_phone_number(phone, "+84")

    if phone_detector(real_phone) is None:
        return False

    return True


def merge_objects(sourceObject, targetObject, save_target_attrs=True):
    sourceObject = copy.deepcopy(
        sourceObject) if sourceObject is not None else {}
    targetObject = copy.deepcopy(
        targetObject) if targetObject is not None else {}
    for key in sourceObject.keys():
        if key == "_id" or key == "id":
            continue

        if save_target_attrs == True:
            if key not in targetObject or targetObject.get(key, None) is None or targetObject.get(key, "") == "":
                targetObject[key] = sourceObject[key]
        else:
            if key in sourceObject and sourceObject[key] is not None and sourceObject[key] != "":
                targetObject[key] = sourceObject[key]
    return targetObject


#
# Generate coupon/voucher
# AA00001, HANFSASDFS
#
def generate_coupon(num=7):
    code = ''.join(random.choice(string.ascii_uppercase + string.digits)
                   for _ in range(num))

    while code[:1] == '0':
        code = ''.join(random.choice(string.ascii_uppercase +
                                     string.digits) for _ in range(num))

    return "%s" % (code)


def generate_number_string(length=16, outtype="number"):

    first_letter = str(random.randint(1, 9))

    s = ''
    for i in range(length - 1):
        s += str(random.randint(0, 9))

    if outtype == "number":
        return int(first_letter + s)
    else:
        return first_letter + s



# get day of week of time
# @default datetime.now()
def get_day_of_week(value=datetime.now()):
    return datetime.strptime(value).weekday()


def get_day_of_week_vi(date):
    if date.weekday() == 0:
        return 'Thứ 2'
    elif date.weekday() == 1:
        return 'Thứ 3'
    elif date.weekday() == 2:
        return 'Thứ 4'
    elif date.weekday() == 3:
        return 'Thứ 5'
    elif date.weekday() == 4:
        return 'Thứ 6'
    elif date.weekday() == 5:
        return 'Thứ 7'
    elif date.weekday() == 6:
        return 'CN'


def get_day_of_week_en(date):
    if date.weekday() == 0:
        return 'Mon'
    elif date.weekday() == 1:
        return 'Tue'
    elif date.weekday() == 2:
        return 'Web'
    elif date.weekday() == 3:
        return 'Thu'
    elif date.weekday() == 4:
        return 'Fri'
    elif date.weekday() == 5:
        return 'Set'
    elif date.weekday() == 6:
        return 'Sun'


# CAREFULLY WHEN USING
def prepare_data(data):
    result = None
    if data is not None and 'dict' in str(type(data)):
        result = {}
        for _ in data:
            abc = str(type(data[_]))
            xyz = abc.split("'")
            if 'uuid.UUID' in xyz:
                result[_] = str(data[_])
            elif 'decimal.Decimal' in xyz:
                result[_] = float(data[_])
            elif 'list' in xyz:
                for index, item in enumerate(data[_]):
                    data[_][index] = prepare_data(item)

                result[_] = data[_]
            elif 'dict' in xyz:
                result[_] = prepare_data(data[_])
            else:
                result[_] = data[_]

    return result



def handle_argument(text, source):
    if source is None:
        source = {}

    result = text
    if text and text.find("{{") >= 0 and text.find("}}") >= 0:
        try:
            template = Environment(
                loader=BaseLoader(),
                undefined=Undefined
            ).from_string(text)

            result = template.render(**source)
        except:
            return None

    return result


def convert_gender(value):
    gender = None
    if value is not None and value != "" and value.strip() != "":
        if value.lower() == 'male' or value.lower() == 'anh' or value.lower() == 'nam'\
                or value.lower() == 'ông' or value.lower() == 'ngài' or str(value) == "1":
            gender = 'male'
        elif value.lower() == 'female' or value.lower() == 'chị' or value.lower() == 'chi'\
            or value.lower() == 'nữ' or value.lower() == 'nu' or value.lower() == 'bà' or str(value) == "0":
            gender = 'female'

    return gender



def combine_variants(variants):
    # recursive function
    def recursive_func(list01, list02):
        output = []
        for x in list01:
            for y in list02:
                if isinstance(x, list) and isinstance(y, list):
                    output.append(x + y)
                elif isinstance(x, list) and not isinstance(y, list):
                    output.append(x + [y])
                elif not isinstance(x, list) and isinstance(y, list):
                    output.append([x] + y)
                else:
                    output.append([x, y])

        return output

    results = []
    for index, i in enumerate(variants):
        if index == 0:
            results = variants[0]
        else:
            results = recursive_func(results, variants[index])

    return results


def convert_no_accent_vietnamese_regex(s):
    s = re.sub(r'[àáạảãâầấậẩẫăằắặẳẵ]', 'a', s)
    s = re.sub(r'[ÀÁẠẢÃĂẰẮẶẲẴÂẦẤẬẨẪ]', 'A', s)
    s = re.sub(r'[èéẹẻẽêềếệểễ]', 'e', s)
    s = re.sub(r'[ÈÉẸẺẼÊỀẾỆỂỄ]', 'E', s)
    s = re.sub(r'[òóọỏõôồốộổỗơờớợởỡ]', 'o', s)
    s = re.sub(r'[ÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ]', 'O', s)
    s = re.sub(r'[ìíịỉĩ]', 'i', s)
    s = re.sub(r'[ÌÍỊỈĨ]', 'I', s)
    s = re.sub(r'[ùúụủũưừứựửữ]', 'u', s)
    s = re.sub(r'[ƯỪỨỰỬỮÙÚỤỦŨ]', 'U', s)
    s = re.sub(r'[ỳýỵỷỹ]', 'y', s)
    s = re.sub(r'[ỲÝỴỶỸ]', 'Y', s)
    s = re.sub(r'[Đ]', 'D', s)
    s = re.sub(r'[đ]', 'd', s)
    return s


def convert_to_unsigned(s):
    s = re.sub(r'[àáạảãâầấậẩẫăằắặẳẵ]', 'a', s)
    s = re.sub(r'[ÀÁẠẢÃĂẰẮẶẲẴÂẦẤẬẨẪ]', 'A', s)
    s = re.sub(r'[èéẹẻẽêềếệểễ]', 'e', s)
    s = re.sub(r'[ÈÉẸẺẼÊỀẾỆỂỄ]', 'E', s)
    s = re.sub(r'[òóọỏõôồốộổỗơờớợởỡ]', 'o', s)
    s = re.sub(r'[ÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ]', 'O', s)
    s = re.sub(r'[ìíịỉĩ]', 'i', s)
    s = re.sub(r'[ÌÍỊỈĨ]', 'I', s)
    s = re.sub(r'[ùúụủũưừứựửữ]', 'u', s)
    s = re.sub(r'[ƯỪỨỰỬỮÙÚỤỦŨ]', 'U', s)
    s = re.sub(r'[ỳýỵỷỹ]', 'y', s)
    s = re.sub(r'[ỲÝỴỶỸ]', 'Y', s)
    s = re.sub(r'[Đ]', 'D', s)
    s = re.sub(r'[đ]', 'd', s)
    return s


def hash_string(string):
    """
    Return a SHA-256 hash of the given string
    """
    return hashlib.sha256(string.encode('utf-8')).hexdigest()

def hashids_string():
    """ Retrun mã đóa đơn """
    times = int((time.time() * 1000))
    Ma_tanent = "DM" 
    hashids = Hashids(min_length=8, alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890')
    hashid = hashids.encode(times)
    result = Ma_tanent + hashid
    return result

def capitalize_first_letters(input):
    if input is not None:
        split_str = input.split(" ")
        result = ""
        for i in split_str:
            i = i[:1].upper() + i[1:]
            result += i + " "
        return result.strip()

    return input

