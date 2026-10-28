from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


class GoogleDocsReadError(RuntimeError):
    pass


def get_document(document_id: str, credentials) -> dict:
    try:
        service = build("docs", "v1", credentials=credentials, cache_discovery=False)
        return (
            service.documents()
            .get(documentId=document_id, includeTabsContent=True)
            .execute()
        )
    except HttpError as error:
        raise GoogleDocsReadError from error
