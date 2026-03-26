from src.models.contact_form import ContactForm
from src.repositories.base import SupabaseRepository


class ContactFormRepository(SupabaseRepository[ContactForm]):
    def __init__(self) -> None:
        super().__init__(table_name="contact_submissions", model_class=ContactForm)

    async def create(self, form_data: dict) -> ContactForm:
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name).insert(form_data).execute()
        )
        data = self._handle_supabase_result(result, expect_single=True)
        return self._build_model(data)
