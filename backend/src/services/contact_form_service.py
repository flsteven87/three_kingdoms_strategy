from src.models.contact_form import ContactForm, ContactFormCreate
from src.repositories.contact_form_repository import ContactFormRepository


class ContactFormService:
    def __init__(self) -> None:
        self._repo = ContactFormRepository()

    async def submit(self, form_data: ContactFormCreate) -> ContactForm:
        data = form_data.model_dump(mode="json")
        return await self._repo.create(data)
