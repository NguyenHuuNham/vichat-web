import os
import multiprocessing
from manager import Manager
from application import run_app

from application.database import db
import asyncio

import sqlalchemy
from sqlalchemy.inspection import inspect
import json
import traceback

manager = Manager()

@manager.command
def run():
    ENVIRONMENT = os.getenv('ENVIRONMENT')
    run_app(host="0.0.0.0", port=int(os.getenv('APP_PORT')))
   


@manager.command
def generate_schema(path = "static/schema", exclude = None, prettyprint = True):
    """ Generate javascript schema static\schema"""
    exclude_list = None
    if path is None:
        print("Path is required")
        return
    
    if exclude is not None:
        exclude_list = exclude.split(",")
        
    for cls in [cls for cls in db.Model._decl_class_registry.values() if isinstance(cls, type) and issubclass(cls, db.Model)]:
        classname = cls.__name__
        print('classname: ',classname)
        if (exclude_list is not None) and (classname in exclude_list):
            continue
        schema = {}
        for col in cls.__table__.c:
            col_type = str(col.type)
            schema_type = ''
            if 'DECIMAL' in col_type:
                schema_type = 'number'
            if col_type in ['INTEGER','SMALLINT', 'FLOAT', 'BIGINT' ]:
                schema_type = 'number'
            if col_type == 'DATETIME':
                schema_type = 'datetime'
            if col_type == 'DATE':
                schema_type = 'datetime'
            if 'VARCHAR' in col_type:
                schema_type = 'string'
            if col_type in ['VARCHAR', 'UUID', 'TEXT']:
                schema_type = 'string'
            if col_type in ['JSON', 'JSONB']:
                schema_type = 'json'
            if 'BOOLEAN' in col_type:
                schema_type = 'boolean'
            
            schema[col.name] = {"type": schema_type}
            
            if col.primary_key:
                schema[col.name]["primary"] = True
            #nullabel
            if (not col.nullable) and (not col.primary_key):
                schema[col.name]["required"] = True
                
            if hasattr(col.type, "length") and (col.type.length is not None):
                schema[col.name]["length"] = col.type.length
            
            #default
            if (col.default is not None) and (col.default.arg is not None) \
                and (not callable(col.default.arg)) and not isinstance(col.default.arg, sqlalchemy.sql.functions.GenericFunction):
                #print(col.default, col.default.arg, callable(col.default.arg))
                schema[col.name]["default"] = col.default.arg
                
            #User confirm_password
            if (classname == "User") and ("password" in col.name):
                schema["confirm_password"] = {"type": schema_type}
                schema["confirm_password"]["length"] = col.type.length
                
                
        
        relations = inspect(cls).relationships
        for rel in relations:
            if rel.direction.name in ['MANYTOMANY', 'ONETOMANY']:
                schema[rel.key] = {"type": "list"}
            if rel.direction.name in ['MANYTOONE']:
                schema[rel.key] = {"type": "dict"}
        
        if prettyprint:
            with open(path + '/' + classname + 'Schema.json', 'w') as outfile:
                json.dump(schema,  outfile, indent=4,)
        else:
            with open(path + '/' + classname + 'Schema.json', 'w') as outfile:
                json.dump(schema,  outfile,)



if __name__ == '__main__':
    manager.main()


# if __name__ == "__main__":
#     create_user()

